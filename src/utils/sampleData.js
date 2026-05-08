import { todayStr, currentMonthKey } from './calculations.js';

const today = todayStr();
const month = currentMonthKey();
const [year, mon] = month.split('-').map(Number);

const mkDate = (d) => `${year}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export const sampleEmployees = [
  { id: 'e1', employeeCode: 'EMP001', name: 'Rahul Sharma',   mobile: '9876543210', role: 'Software Engineer', monthlySalary: 35000, joiningDate: '2022-03-01', status: 'Active',   createdAt: '2022-03-01T00:00:00Z' },
  { id: 'e2', employeeCode: 'EMP002', name: 'Priya Singh',    mobile: '9876543211', role: 'HR Manager',        monthlySalary: 28000, joiningDate: '2021-07-15', status: 'Active',   createdAt: '2021-07-15T00:00:00Z' },
  { id: 'e3', employeeCode: 'EMP003', name: 'Amit Kumar',     mobile: '9876543212', role: 'Sales Executive',   monthlySalary: 22000, joiningDate: '2023-01-10', status: 'Active',   createdAt: '2023-01-10T00:00:00Z' },
  { id: 'e4', employeeCode: 'EMP004', name: 'Neha Patel',     mobile: '9876543213', role: 'Accountant',        monthlySalary: 25000, joiningDate: '2022-08-20', status: 'Active',   createdAt: '2022-08-20T00:00:00Z' },
  { id: 'e5', employeeCode: 'EMP005', name: 'Suresh Reddy',   mobile: '9876543214', role: 'Driver',            monthlySalary: 15000, joiningDate: '2020-05-01', status: 'Inactive', createdAt: '2020-05-01T00:00:00Z' },
];

const statuses = ['Present','Present','Present','Present','Half Day','Absent','Weekly Off','Present','Present','Paid Leave'];

export const sampleAttendance = [];
for (let d = 1; d <= 20; d++) {
  const date = mkDate(d);
  if (date > today) continue;
  sampleEmployees.filter(e => e.status === 'Active').forEach((emp, i) => {
    sampleAttendance.push({
      id: `att_${emp.id}_${date}`,
      employeeId: emp.id,
      date,
      status: statuses[(d + i) % statuses.length],
      overtimeHours: (d % 5 === 0 && i === 0) ? 2 : 0,
      lateFine: 0,
      remarks: '',
      createdAt: new Date().toISOString(),
    });
  });
}

export const sampleAdvances = [
  { id: 'adv1', employeeId: 'e1', date: mkDate(3),  amount: 10000, deductedAmount: 4000, remainingAmount: 6000, paymentMode: 'Cash',         remarks: 'Medical emergency', status: 'Partially Deducted', createdAt: new Date().toISOString() },
  { id: 'adv2', employeeId: 'e2', date: mkDate(5),  amount:  5000, deductedAmount:    0, remainingAmount: 5000, paymentMode: 'UPI',          remarks: 'Personal need',     status: 'Pending',            createdAt: new Date().toISOString() },
  { id: 'adv3', employeeId: 'e3', date: mkDate(8),  amount:  3000, deductedAmount: 3000, remainingAmount:    0, paymentMode: 'Bank Transfer', remarks: '',                  status: 'Deducted',           createdAt: new Date().toISOString() },
  { id: 'adv4', employeeId: 'e4', date: mkDate(10), amount:  8000, deductedAmount:    0, remainingAmount: 8000, paymentMode: 'Cash',         remarks: 'Home repair',       status: 'Pending',            createdAt: new Date().toISOString() },
];
