from pathlib import Path
from urllib.parse import urlparse
import shutil
import openpyxl

ROOT = Path(__file__).resolve().parents[2]
BOOK = ROOT / "ghazal.xlsx"
BACKUP = ROOT / "ghazal-before-normalization.xlsx"
READY = ROOT / "جاهز للرفع"

if not BACKUP.exists():
    shutil.copy2(BOOK, BACKUP)

wb = openpyxl.load_workbook(BOOK)

def basename(value):
    if not value:
        return None
    text = str(value).replace("/", "\\")
    if "?" in text:
        text = text.split("?", 1)[0]
    return Path(urlparse(text).path).name or Path(text).name

def ready_path(value):
    name = basename(value)
    if not name:
        return value
    candidate = READY / name
    if candidate.exists():
        return f"جاهز للرفع\\{candidate.name}"
    return value

# Remove fields that are not part of the product model or are internal-only Excel calculations.
products = wb["Products"]
remove_headers = {"العلامة التجارية"}  # brand remains useful and maps to Brand.nameAr
remove_headers = {"المورد", "معرف المورد", "فرق السعر د.أ", "هامش الربح الإجمالي"}
headers = [products.cell(1, c).value for c in range(1, products.max_column + 1)]
for col in sorted([i + 1 for i, h in enumerate(headers) if h in remove_headers], reverse=True):
    products.delete_cols(col, 1)

# Update file references to the final local assets, without embedding product data in the app source.
products_headers = {products.cell(1, c).value: c for c in range(1, products.max_column + 1)}
for row in range(2, products.max_row + 1):
    for header in ("الصورة الرئيسية", "الصور الإضافية"):
        c = products_headers.get(header)
        if c:
            products.cell(row, c).value = ready_path(products.cell(row, c).value)
    # These rows are the source of the online import. Missing prices remain explicitly blocked.
    cost = products.cell(row, products_headers["سعر التكلفة د.أ"]).value
    sale = products.cell(row, products_headers["سعر البيع د.أ"]).value
    status_col = products_headers.get("حالة المعالجة")
    db_col = products_headers.get("حالة قاعدة البيانات")
    if status_col and db_col:
        if isinstance(cost, (int, float)) and isinstance(sale, (int, float)) and cost > 0 and sale > 0:
            if products.cell(row, status_col).value == "ناقص أسعار - غير جاهز للاستيراد":
                products.cell(row, status_col).value = "جاهز للاستيراد"
            if products.cell(row, db_col).value == "لم تتم الإضافة":
                products.cell(row, db_col).value = "جاهز للإضافة"

variants = wb["Variants"]
variant_headers = {variants.cell(1, c).value: c for c in range(1, variants.max_column + 1)}
for row in range(2, variants.max_row + 1):
    c = variant_headers.get("صورة الخيار")
    if c:
        variants.cell(row, c).value = ready_path(variants.cell(row, c).value)

images = wb["Images"]
image_headers = {images.cell(1, c).value: c for c in range(1, images.max_column + 1)}
for row in range(2, images.max_row + 1):
    name_col = image_headers.get("اسم الصورة النهائية")
    path_col = image_headers.get("مسار الصورة النهائية")
    if name_col and path_col:
        name = basename(images.cell(row, name_col).value) or basename(images.cell(row, image_headers.get("مسار الصورة الأصلية", 0)).value if image_headers.get("مسار الصورة الأصلية") else None)
        if name and (READY / name).exists():
            images.cell(row, name_col).value = name
            images.cell(row, path_col).value = f"جاهز للرفع\\{name}"
            if "حالة تجهيز الصورة" in image_headers:
                images.cell(row, image_headers["حالة تجهيز الصورة"]).value = "جاهزة للرفع"
            if "حالة الأرشفة" in image_headers:
                images.cell(row, image_headers["حالة الأرشفة"]).value = "الأصل مؤرشف في خلفية بيضاء مكتملة"

# Make the mapping sheet reflect the actual Prisma model used by the import workflow.
if "Field Mapping" in wb.sheetnames:
    del wb["Field Mapping"]
mapping = wb.create_sheet("Field Mapping")
mapping.append(["الورقة", "العمود", "حقل المشروع", "الاستخدام", "ملاحظات"])
rows = [
    ("Products", "المعرف المرجعي", "Product.sku", "مفتاح المطابقة", "يُستخدم كما هو دون إضافة ملفات منتجات للمشروع"),
    ("Products", "اسم المنتج بالعربية", "Product.nameAr", "استيراد", "مطلوب"),
    ("Products", "اسم المنتج بالإنجليزية", "Product.nameEn", "استيراد", "يُستخدم الاسم العربي عند الفراغ"),
    ("Products", "العلامة التجارية", "Brand.nameAr → Product.brandId", "استيراد", "علامة المنتج فقط؛ لا يُستخدم اسم المحل"),
    ("Products", "التصنيف الرئيسي", "Category.name", "مطابقة", "يُطابق مع أقسام المشروع الموجودة"),
    ("Products", "التصنيف الفرعي", "Product.categoryId", "مطابقة", "يُستخدم كتصنيف المنتج عند توفره"),
    ("Products", "سعر التكلفة د.أ", "ProductVariant.costPrice / 1000", "إدارة فقط", "لا يُرسل إلى واجهة العميل"),
    ("Products", "سعر البيع د.أ", "ProductVariant.price / 1000", "استيراد", "يُخزن بالفلس داخل القاعدة"),
    ("Products", "الوصف المختصر", "Product.shortDescription", "استيراد", "عام للعميل"),
    ("Products", "الوصف التفصيلي", "Product.longDescription", "استيراد", "عام للعميل بعد تنظيف أي أسعار حساسة"),
    ("Products", "نوع الخيارات", "ProductVariant.colorName / size / shade", "استيراد", "حسب بيانات Variants"),
    ("Products", "الصورة الرئيسية", "ProductImage.url", "رفع لاحق", "تُرفع من مجلد جاهز للرفع"),
    ("Variants", "اسم الخيار بالعربية", "ProductVariant.colorName", "استيراد", "اختياري"),
    ("Variants", "الحجم", "ProductVariant.size", "استيراد", "افتراضي Standard عند الفراغ"),
    ("Variants", "تكلفة الخيار د.أ", "ProductVariant.costPrice / 1000", "إدارة فقط", "لا يظهر للعميل بأي حال"),
    ("Variants", "بيع الخيار د.أ", "ProductVariant.price / 1000", "استيراد", "مطلوب"),
    ("Variants", "SKU", "ProductVariant.sku", "مفتاح المطابقة", "فريد"),
    ("Variants", "صورة الخيار", "ProductVariant.imageUrl", "رفع لاحق", "تُرفع من مجلد جاهز للرفع"),
    ("Images", "مسار الصورة النهائية", "ProductImage.url", "رفع لاحق", "لا تُحفظ الصور داخل src"),
]
for row in rows:
    mapping.append(row)

for ws in wb.worksheets:
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions

wb.save(BOOK)
print(f"normalized={BOOK}")
print(f"backup={BACKUP}")
