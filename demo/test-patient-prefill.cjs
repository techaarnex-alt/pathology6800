const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const functions = html.match(/function reportSexValue\(value\).*?(?=\r?\n)/)[0];
const fields = Object.fromEntries(['reportPatient', 'reportMobile', 'reportTitle', 'reportSex', 'reportPatientDetails'].map(id => [id, { value: '', hidden: false, innerHTML: '' }]));
fields.reportTitle.options = ['', 'Mr.', 'Mrs.', 'Dr.'].map(value => ({ value }));
fields.reportTitle.querySelector = () => fields.reportTitle.options.find(option => option.dataset?.savedTitle !== undefined);
fields.reportTitle.append = option => { option.remove = () => { fields.reportTitle.options = fields.reportTitle.options.filter(item => item !== option); }; fields.reportTitle.options.push(option); };
const patients = {
  historical: { id: 'historical', name: 'Historical', age: '50', sex: 'F', reference: 'Doctor' },
  registered: { id: 'registered', name: 'Registered', age: '35', sex: 'Male', title: 'Mr.', mobile: '1234567890' },
  other: { id: 'other', name: 'Other', sex: 'Other' }
};
const context = { document: { getElementById: id => fields[id], createElement: () => ({ dataset: {} }) }, patientById: id => patients[id], patientName: p => [p.title, p.name].filter(Boolean).join(' '), esc: value => String(value) };
vm.createContext(context);
vm.runInContext(html.match(/function selectSavedReportTitle\(select,value\).*?(?=\r?\n)/)[0], context);
vm.runInContext(functions, context);
for (const [value, expected] of [['F', 'Female'], ['M', 'Male'], ['female', 'Female'], ['Male', 'Male'], ['Other', 'Other'], ['', '']]) assert.equal(context.reportSexValue(value), expected);
fields.reportPatient.value = 'registered';
context.prefillReportPatient();
assert.equal(fields.reportSex.value, 'Male');
assert.equal(fields.reportTitle.value, 'Mr.');
assert.equal(fields.reportMobile.value, '1234567890');
context.selectSavedReportTitle(fields.reportTitle, 'mr');
assert.equal(fields.reportTitle.value, 'Mr.');
context.selectSavedReportTitle(fields.reportTitle, 'Custom title');
assert.equal(fields.reportTitle.value, 'Custom title');
fields.reportPatient.value = 'historical';
context.prefillReportPatient();
assert.equal(fields.reportSex.value, 'Female');
assert.equal(fields.reportTitle.value, '');
assert.equal(fields.reportMobile.value, '');
assert.equal(fields.reportPatientDetails.hidden, false);
fields.reportPatient.value = '';
context.prefillReportPatient();
assert.equal(fields.reportSex.value, '');
assert.equal(fields.reportPatientDetails.hidden, true);
console.log('Patient prefill tests passed');
