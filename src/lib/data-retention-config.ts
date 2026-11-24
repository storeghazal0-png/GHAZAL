export interface DataRetentionPolicy {
  invoicesDays: number;
  systemLogsDays: number;
  coreEntitiesRetention: 'PERMANENT';
}

export const DATA_RETENTION_CONFIG: DataRetentionPolicy = {
  invoicesDays: 90, // مدة الاحتفاظ بالفواتير وإيصالات الكاشير: 90 يوماً
  systemLogsDays: 0, // لا يتم حفظ السجلات والعمليات المؤقتة المنتهية نهائياً (تفريغ كامل)
  coreEntitiesRetention: 'PERMANENT' // المنتجات والتصنيفات والبيانات الرئيسية دائمة للأبد
};
