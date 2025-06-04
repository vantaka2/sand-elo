const { execSync } = require('child_process')

console.log('🚀 Quick import of all CBVA data...')
console.log('')

try {
  // Stage all data
  console.log('1️⃣  Staging all tournament data...')
  execSync('node scripts/stage-cbva-data.js --all', { stdio: 'inherit' })
  
  console.log('')
  console.log('2️⃣  Processing all staged data...')
  execSync('node scripts/process-cbva-data.js --all', { stdio: 'inherit' })
  
  console.log('')
  console.log('3️⃣  Checking final status...')
  execSync('node check-status.js', { stdio: 'inherit' })
  
  console.log('')
  console.log('✅ Import complete! Ready for rating recalculation.')
  
} catch (error) {
  console.error('❌ Import failed:', error.message)
  process.exit(1)
}