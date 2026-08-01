import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Users, UserCheck, Clock, ShieldAlert, Search, RefreshCw, 
  Calendar, FileSpreadsheet, Lock, LogOut, CheckCircle2, PlusCircle, Trash2 
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';

export default function AdminDashboard() {
  const { isAuthenticated, login, logout, API_URL } = useAuth();
  const { addNotification } = useNotification();

  // Login form state
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Dashboard Data
  const [summary, setSummary] = useState({
    total_faculty: 0,
    present_today: 0,
    currently_active: 0,
    total_working_hours_today: 0.0
  });

  const [logs, setLogs] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Filter States
  const [filterDept, setFilterDept] = useState('');
  const [filterId, setFilterId] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // Modal States for Manual Override
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideData, setOverrideData] = useState({
    teacherId: '',
    checkInTime: '',
    checkOutTime: '',
    status: 'COMPLETED'
  });
  const [isSavingOverride, setIsSavingOverride] = useState(false);

  // Handle Login
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (!usernameInput || !passwordInput) {
      addNotification('Username and password are required.', 'warning');
      return;
    }
    setIsLoggingIn(true);
    await login(usernameInput, passwordInput);
    setIsLoggingIn(false);
  };

  // Fetch metrics & logs
  const fetchDashboardData = async () => {
    if (!isAuthenticated) return;
    setIsLoading(true);
    try {
      // 1. Summary Metrics
      const summaryRes = await axios.get(`${API_URL}/reports/summary`);
      setSummary(summaryRes.data);

      // 2. Attendance Logs (with filter params)
      const params = {};
      if (filterDept) params.department = filterDept;
      if (filterId) params.teacher_id = filterId;
      if (filterDateFrom) params.date_from = filterDateFrom;
      if (filterDateTo) params.date_to = filterDateTo;

      const logsRes = await axios.get(`${API_URL}/reports/attendance`, { params });
      setLogs(logsRes.data);

      // 3. Teachers list (for manual override selector)
      const teachersRes = await axios.get(`${API_URL}/reports/teachers`);
      setTeachers(teachersRes.data);
    } catch (err) {
      console.error(err);
      addNotification('Error fetching dashboard records.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Refresh trigger when filter settings change or user logs in
  useEffect(() => {
    fetchDashboardData();
  }, [isAuthenticated, filterDept, filterId, filterDateFrom, filterDateTo]);

  // Handle manual override save
  const handleSaveOverride = async (e) => {
    e.preventDefault();
    if (!overrideData.teacherId || !overrideData.checkInTime) {
      addNotification('Teacher and Check-In time are required.', 'warning');
      return;
    }
    setIsSavingOverride(true);
    try {
      const payload = {
        teacher_id: overrideData.teacherId,
        check_in_time: new Date(overrideData.checkInTime).toISOString(),
        check_out_time: overrideData.checkOutTime ? new Date(overrideData.checkOutTime).toISOString() : null,
        status: overrideData.status
      };

      await axios.post(`${API_URL}/reports/attendance/override`, payload);
      addNotification('Manual override session logged.', 'success');
      setShowOverrideModal(false);
      
      // Reset form
      setOverrideData({
        teacherId: '',
        checkInTime: '',
        checkOutTime: '',
        status: 'COMPLETED'
      });
      
      fetchDashboardData();
    } catch (err) {
      console.error(err);
      const detail = err.response?.data?.detail || 'Override failed.';
      addNotification(detail, 'error');
    } finally {
      setIsSavingOverride(false);
    }
  };

  // Delete Log record
  const handleDeleteLog = async (logId) => {
    if (!window.confirm('Are you sure you want to delete this attendance log?')) return;
    try {
      await axios.delete(`${API_URL}/reports/attendance/${logId}`);
      addNotification('Attendance log deleted.', 'success');
      fetchDashboardData();
    } catch (err) {
      console.error(err);
      addNotification('Failed to delete log.', 'error');
    }
  };

  // Export logs to CSV
  const exportToCSV = () => {
    if (logs.length === 0) {
      addNotification('No data to export.', 'warning');
      return;
    }

    const headers = ['Log ID', 'Teacher ID', 'Name', 'Department', 'Date', 'Check-In', 'Check-Out', 'Total Hours', 'Status'];
    const rows = logs.map(log => [
      log.id,
      log.teacher_id,
      log.teacher_name,
      log.teacher_department,
      log.date,
      log.check_in_time,
      log.check_out_time || 'N/A',
      log.total_working_hours !== null ? log.total_working_hours.toFixed(2) : 'N/A',
      log.status
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.map(val => `"${val}"`).join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `facultypass_attendance_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Render Login state if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="glass-panel p-8 rounded-2xl w-full max-w-md shadow-2xl relative">
          <div className="absolute right-0 top-0 w-48 h-48 bg-sky-500/10 rounded-full blur-2xl"></div>
          
          <div className="flex flex-col items-center mb-6">
            <div className="p-3.5 bg-sky-500/10 text-sky-400 rounded-2xl mb-3 border border-sky-500/20">
              <Lock size={28} />
            </div>
            <h2 className="text-xl font-bold text-slate-100">Administrator Console</h2>
            <p className="text-slate-400 text-xs mt-1">Authenticate to access attendance logs and override panels</p>
          </div>

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Username</label>
              <input
                type="text"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                placeholder="admin"
                className="w-full bg-slate-900 border border-slate-800 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 rounded-lg py-2 px-3.5 text-sm text-slate-100 placeholder-slate-600 outline-none transition"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Password</label>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-900 border border-slate-800 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 rounded-lg py-2 px-3.5 text-sm text-slate-100 placeholder-slate-600 outline-none transition"
              />
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full mt-2 bg-sky-500 hover:bg-sky-600 text-white font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-55 shadow-lg shadow-sky-500/20"
            >
              {isLoggingIn ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  Authenticating...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 space-y-6">
      {/* Top Banner Row */}
      <div className="glass-panel p-6 rounded-2xl shadow-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-64 h-64 bg-sky-500/5 rounded-full blur-3xl"></div>
        <div>
          <h2 className="text-2xl font-bold text-slate-200">Management & Audit Control</h2>
          <p className="text-slate-400 text-sm mt-1">Review check-in logs, download CSV sheets, and override student/faculty sessions.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowOverrideModal(true)}
            className="bg-sky-500 hover:bg-sky-600 text-white font-semibold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 transition shadow-lg shadow-sky-500/25"
          >
            <PlusCircle size={16} />
            Manual Override
          </button>
          <button
            onClick={logout}
            className="bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 font-semibold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 transition"
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1 */}
        <div className="glass-panel p-5 rounded-2xl flex items-center gap-4 border border-slate-900">
          <div className="p-3 bg-sky-500/10 text-sky-400 rounded-xl">
            <Users size={22} />
          </div>
          <div>
            <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Total Faculty</div>
            <div className="text-2xl font-extrabold text-slate-100 mt-1">{summary.total_faculty}</div>
          </div>
        </div>

        {/* Card 2 */}
        <div className="glass-panel p-5 rounded-2xl flex items-center gap-4 border border-slate-900">
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl">
            <UserCheck size={22} />
          </div>
          <div>
            <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Present Today</div>
            <div className="text-2xl font-extrabold text-slate-100 mt-1">{summary.present_today}</div>
          </div>
        </div>

        {/* Card 3 */}
        <div className="glass-panel p-5 rounded-2xl flex items-center gap-4 border border-slate-900">
          <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl">
            <CheckCircle2 size={22} />
          </div>
          <div>
            <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Currently Checked-In</div>
            <div className="text-2xl font-extrabold text-slate-100 mt-1">{summary.currently_active}</div>
          </div>
        </div>

        {/* Card 4 */}
        <div className="glass-panel p-5 rounded-2xl flex items-center gap-4 border border-slate-900">
          <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl">
            <Clock size={22} />
          </div>
          <div>
            <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Hours Logged Today</div>
            <div className="text-2xl font-extrabold text-slate-100 mt-1">{summary.total_working_hours_today}h</div>
          </div>
        </div>
      </div>

      {/* Filter and Table Section */}
      <div className="glass-panel rounded-2xl overflow-hidden shadow-xl border border-slate-900">
        
        {/* Filters Header bar */}
        <div className="p-5 border-b border-slate-800 bg-slate-900/40 flex flex-col lg:flex-row items-center justify-between gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 w-full lg:max-w-4xl">
            {/* Filter 1 */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-slate-600" size={16} />
              <input
                type="text"
                placeholder="Filter Teacher ID"
                value={filterId}
                onChange={(e) => setFilterId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 focus:ring-sky-500 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 outline-none"
              />
            </div>
            {/* Filter 2 */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-slate-600" size={16} />
              <input
                type="text"
                placeholder="Filter Department"
                value={filterDept}
                onChange={(e) => setFilterDept(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 focus:ring-sky-500 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 outline-none"
              />
            </div>
            {/* Filter 3 */}
            <div className="relative">
              <Calendar className="absolute left-3 top-2.5 text-slate-600" size={16} />
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 focus:ring-sky-500 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 outline-none"
              />
            </div>
            {/* Filter 4 */}
            <div className="relative">
              <Calendar className="absolute left-3 top-2.5 text-slate-600" size={16} />
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 focus:ring-sky-500 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 outline-none"
              />
            </div>
          </div>

          <div className="flex gap-2 w-full lg:w-auto justify-end">
            <button
              onClick={fetchDashboardData}
              disabled={isLoading}
              className="bg-slate-900 hover:bg-slate-800 border border-slate-800 p-2 rounded-lg text-slate-400 transition"
              title="Refresh logs"
            >
              <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={exportToCSV}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-3 py-2 rounded-lg flex items-center gap-1.5 transition"
            >
              <FileSpreadsheet size={16} />
              Export CSV
            </button>
          </div>
        </div>

        {/* Logs Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-900/60 border-b border-slate-800 text-slate-400 font-semibold">
                <th className="p-4">Teacher</th>
                <th className="p-4">Department</th>
                <th className="p-4">Date</th>
                <th className="p-4">Check-In</th>
                <th className="p-4">Check-Out</th>
                <th className="p-4">Hours</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900">
              {isLoading ? (
                <tr>
                  <td colSpan="8" className="p-8 text-center text-slate-500">
                    <RefreshCw className="animate-spin inline-block mr-2" size={16} />
                    Loading attendance database records...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan="8" className="p-8 text-center text-slate-500">
                    No matching attendance logs found.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-900/40 text-slate-300">
                    <td className="p-4">
                      <div className="font-semibold text-slate-200">{log.teacher_name}</div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">{log.teacher_id}</div>
                    </td>
                    <td className="p-4 text-slate-400">{log.teacher_department}</td>
                    <td className="p-4 text-slate-400">{log.date}</td>
                    <td className="p-4 font-mono text-slate-400">
                      {new Date(log.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td className="p-4 font-mono text-slate-400">
                      {log.check_out_time 
                        ? new Date(log.check_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) 
                        : '—'}
                    </td>
                    <td className="p-4 font-semibold text-sky-400">
                      {log.total_working_hours !== null ? `${log.total_working_hours.toFixed(2)}h` : '—'}
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                        log.status === 'CHECKED_IN'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : log.status === 'COMPLETED' || log.status === 'CHECKED_OUT'
                          ? 'bg-sky-500/10 text-sky-400'
                          : 'bg-rose-500/10 text-rose-400'
                      }`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <button
                        onClick={() => handleDeleteLog(log.id)}
                        className="text-rose-500 hover:text-rose-400 p-1 hover:bg-rose-500/10 rounded transition"
                        title="Delete log record"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual Override Modal Overlay */}
      {showOverrideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="glass-panel p-6 rounded-2xl w-full max-w-md shadow-2xl relative border border-slate-800">
            <h3 className="text-lg font-bold text-slate-200 mb-4">Manual Attendance Session Override</h3>
            
            <form onSubmit={handleSaveOverride} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Select Teacher</label>
                <select
                  value={overrideData.teacherId}
                  onChange={(e) => setOverrideData({ ...overrideData, teacherId: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 text-sm text-slate-200 outline-none"
                >
                  <option value="">-- Choose registered teacher --</option>
                  {teachers.map(t => (
                    <option key={t.teacher_id} value={t.teacher_id}>
                      {t.name} ({t.teacher_id})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Check-In Datetime</label>
                <input
                  type="datetime-local"
                  value={overrideData.checkInTime}
                  onChange={(e) => setOverrideData({ ...overrideData, checkInTime: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 text-sm text-slate-200 outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Check-Out Datetime (Optional)</label>
                <input
                  type="datetime-local"
                  value={overrideData.checkOutTime}
                  onChange={(e) => setOverrideData({ ...overrideData, checkOutTime: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 text-sm text-slate-200 outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Session Status</label>
                <select
                  value={overrideData.status}
                  onChange={(e) => setOverrideData({ ...overrideData, status: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 text-sm text-slate-200 outline-none"
                >
                  <option value="CHECKED_IN">CHECKED_IN (Open Session)</option>
                  <option value="COMPLETED">COMPLETED (Closed Session)</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2 justify-end text-xs">
                <button
                  type="button"
                  onClick={() => setShowOverrideModal(false)}
                  className="bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 px-4 py-2 rounded-lg font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingOverride}
                  className="bg-sky-500 hover:bg-sky-600 text-white px-4 py-2 rounded-lg font-semibold flex items-center gap-1 shadow-lg shadow-sky-500/20"
                >
                  {isSavingOverride && <RefreshCw size={14} className="animate-spin" />}
                  Save Session
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
