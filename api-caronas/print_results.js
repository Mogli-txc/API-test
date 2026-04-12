var data = require('./jest_results.json');
data.testResults.forEach(function(suite) {
  var parts = suite.testFilePath.split('tests');
  var fp = parts[parts.length - 1].replace(/^[\\/]/, '');
  var status = suite.status === 'passed' ? 'PASS' : 'FAIL';
  console.log(status + ' ' + fp);
  suite.testResults.forEach(function(t) {
    var icon = t.status === 'passed' ? 'OK  ' : 'FAIL';
    console.log('  [' + icon + '] ' + t.fullName);
  });
  console.log('');
});
console.log('Suites: ' + data.numPassedTestSuites + '/' + data.numTotalTestSuites);
console.log('Tests:  ' + data.numPassedTests + '/' + data.numTotalTests);
