import { performDataRetentionCleanup } from '../src/lib/data-retention';

async function main() {
  console.log('\n===============================================================');
  console.log('🧹 GHAZAL AUTOMATED WEEKLY DATA RETENTION & STORAGE CLEANUP');
  console.log(`⏰ Started at: ${new Date().toISOString()}`);
  console.log('===============================================================\n');

  try {
    const result = await performDataRetentionCleanup({ trigger: 'GITHUB_ACTIONS_CRON' });

    console.log(`✅ Success: ${result.success}`);
    console.log(`📊 Total records cleaned: ${result.totalDeleted}`);
    console.log(`   - Invoices deleted (> 90 days): ${result.deletedInvoices}`);
    console.log(`   - System logs & transient events purged: ${result.deletedLogs}`);
    console.log(`   - Expired sessions deleted: ${result.deletedSessions}`);
    console.log(`💬 Message: ${result.message}\n`);
    console.log('🎉 Data Retention cycle completed successfully!');

    if (!result.success) {
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Fatal error in retention cleanup:', err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
