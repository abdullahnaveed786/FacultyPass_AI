import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Users, UserCheck, Clock, ShieldAlert, Search, RefreshCw, 
  Calendar, FileSpreadsheet, Lock, LogOut, CheckCircle2, PlusCircle, Trash2, Eye, EyeOff 
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';

export default function AdminDashboard() {
  const { token, isAuthenticated, login, logout, API_URL } = useAuth();
  const { addNotification } = useNotification();

  // Login form state
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Tabs state
  const [activeTab, setActiveTab] = useState('attendance'); // 'attendance' or 'teachers'
  const [teacherSearch, setTeacherSearch] = useState('');

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
    if (!isAuthenticated || !token) return;
    setIsLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };

      // 1. Summary Metrics
      const summaryRes = await axios.get(API_URL + '/reports/summary', { headers });
      setSummary(summaryRes.data);

      // 2. Attendance Logs (with filter params)
      const params = {};
      if (filterDept) params.department = filterDept;
      if (filterId) params.teacher_id = filterId;
      if (filterDateFrom) params.date_from = filterDateFrom;
      if (filterDateTo) params.date_to = filterDateTo;

      const logsRes = await axios.get(API_URL + '/reports/attendance', { params, headers });
      setLogs(logsRes.data);

      // 3. Teachers list (for manual override selector)
      const teachersRes = await axios.get(API_URL + '/reports/teachers', { headers });
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
  }, [isAuthenticated, token, filterDept, filterId, filterDateFrom, filterDateTo]);

  // Handle manual override save
  const handleSaveOverride = async (e) => {
    e.preventDefault();
    if (!overrideData.teacherId || !overrideData.checkInTime) {
      addNotification('Teacher and Check-In time are required.', 'warning');
      return;
    }
    setIsSavingOverride(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const payload = {
        teacher_id: overrideData.teacherId,
        check_in_time: new Date(overrideData.checkInTime).toISOString(),
        check_out_time: overrideData.checkOutTime ? new Date(overrideData.checkOutTime).toISOString() : null,
        status: overrideData.status
      };

      await axios.post(API_URL + '/reports/attendance/override', payload, { headers });
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
      const headers = { Authorization: `Bearer ${token}` };
      await axios.delete(API_URL + '/reports/attendance/' + logId, { headers });
      addNotification('Attendance log deleted.', 'success');
      fetchDashboardData();
    } catch (err) {
      console.error(err);
      addNotification('Failed to delete log.', 'error');
    }
  };

  // Delete Teacher record
  const handleDeleteTeacher = async (teacherId, name) => {
    if (!window.confirm(`Are you sure you want to delete faculty profile "${name}" (${teacherId})?\nThis will remove their enrolled 3D face embeddings and attendance records.`)) return;
    try {
      const headers = { Authorization: `Bearer ${token}` };
      await axios.delete(API_URL + '/reports/teachers/' + teacherId, { headers });
      addNotification(`Faculty member "${name}" deleted successfully.`, 'success');
      setTeachers(prev => prev.filter(t => t.teacher_id !== teacherId));
      fetchDashboardData();
    } catch (err) {
      console.error(err);
      addNotification('Failed to delete faculty member.', 'error');
    }
  };

  // Export logs to CSV
  const exportToCSV = () => {
    if (logs.length === 0) {
      addNotification('No data to export.', 'warning');
      return;
    }

    const csvHeaders = ['Log ID', 'Teacher ID', 'Name', 'Department', 'Date', 'Check-In', 'Check-Out', 'Total Hours', 'Status'];
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
      + [csvHeaders.join(','), ...rows.map(e => e.map(val => `"${val}"`).join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `facultypass_attendance_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter teachers list
  const filteredTeachers = teachers.filter(t => 
    t.name.toLowerCase().includes(teacherSearch.toLowerCase()) || 
    t.teacher_id.toLowerCase().includes(teacherSearch.toLowerCase()) ||
    (t.department && t.department.toLowerCase().includes(teacherSearch.toLowerCase()))
  );

  // Render Login state if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="glass-panel p-8 rounded-2xl w-full max-w-md shadow-xl border border-slate-200/80 bg-white relative">
          <div className="absolute right-0 top-0 w-48 h-48 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none"></div>
          
          <div className="flex flex-col items-center mb-6">
            <div className="p-3.5 bg-indigo-50 text-indigo-600 rounded-2xl mb-3 border border-indigo-100">
              <Lock size={24} />
            </div>
            <h2 className="text-lg font-bold text-slate-800">Administrator Console</h2>
            <p className="text-slate-400 text-xs mt-1 text-center">Authenticate to access attendance logs and override panels</p>
          </div>

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-450 uppercase tracking-wider mb-2">Username</label>
              <input
                type="text"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                placeholder="admin"
                className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg py-2 px-3.5 text-sm text-slate-800 placeholder-slate-400 outline-none transition"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-455 uppercase tracking-wider mb-2">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg py-2 pl-3.5 pr-10 text-sm text-slate-800 placeholder-slate-400 outline-none transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-650 transition"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full mt-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-55 shadow-md shadow-indigo-600/10"
            >
              {isLoggingIn ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
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
      <div className="glass-panel p-6 rounded-2xl shadow-sm border border-slate-200/80 bg-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></div>
        <div>
          <h2 className="text-xl font-bold text-slate-800">Management & Audit Control</h2>
          <p className="text-slate-400 text-xs mt-1">Review check-in logs, download CSV sheets, and override student/faculty sessions.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowOverrideModal(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 transition shadow-md shadow-indigo-500/10"
          >
            <PlusCircle size={15} />
            Manual Override
          </button>
          <button
            onClick={logout}
            className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-505 font-semibold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 transition shadow-sm"
          >
            <LogOut size={15} />
            Logout
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1 */}
        <div className="glass-panel p-5 rounded-2xl flex items-center gap-4 border border-slate-200 bg-white shadow-sm">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100/50">
            <Users size={22} className="text-indigo-600" />
          </div>
          <div>
            <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Total Faculty</div>
            <div className="text-xl font-extrabold text-slate-800 mt-0.5">{summary.total_faculty}</div>
          </div>
        </div>

        {/* Card 2 */}
        <div className="glass-panel p-5 rounded-2xl flex items-center gap-4 border border-slate-200 bg-white shadow-sm">
          <div className="p-3 bg-emerald-50 text-emerald-650 rounded-xl border border-emerald-100/50">
            <UserCheck size={22} className="text-emerald-600" />
          </div>
          <div>
            <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Present Today</div>
            <div className="text-xl font-extrabold text-slate-800 mt-0.5">{summary.present_today}</div>
          </div>
        </div>

        {/* Card 3 */}
        <div className="glass-panel p-5 rounded-2xl flex items-center gap-4 border border-slate-200 bg-white shadow-sm">
          <div className="p-3 bg-sky-50 text-sky-650 rounded-xl border border-sky-100/50">
            <CheckCircle2 size={22} className="text-sky-600" />
          </div>
          <div>
            <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Currently Checked-In</div>
            <div className="text-xl font-extrabold text-slate-800 mt-0.5">{summary.currently_active}</div>
          </div>
        </div>

        {/* Card 4 */}
        <div className="glass-panel p-5 rounded-2xl flex items-center gap-4 border border-slate-200 bg-white shadow-sm">
          <div className="p-3 bg-amber-50 text-amber-650 rounded-xl border border-amber-100/50">
            <Clock size={22} className="text-amber-600" />
          </div>
          <div>
            <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Hours Logged Today</div>
            <div className="text-xl font-extrabold text-slate-800 mt-0.5">{summary.total_working_hours_today}h</div>
          </div>
        </div>
      </div>

      {/* Tabs Row */}
      <div className="flex border-b border-slate-200 gap-6 text-sm font-semibold px-2">
        <button
          onClick={() => setActiveTab('attendance')}
          className={`pb-3 px-1 transition relative ${
            activeTab === 'attendance'
              ? 'text-indigo-600 border-b-2 border-indigo-600 font-bold'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          Attendance Logs
        </button>
        <button
          onClick={() => setActiveTab('teachers')}
          className={`pb-3 px-1 transition relative ${
            activeTab === 'teachers'
              ? 'text-indigo-600 border-b-2 border-indigo-600 font-bold'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          Registered Faculty ({teachers.length})
        </button>
      </div>

      {/* Filter and Table Section */}
      <div className="glass-panel rounded-2xl overflow-hidden shadow-sm border border-slate-200 bg-white">
        {activeTab === 'attendance' ? (
          <>
            {/* Filters Header bar */}
            <div className="p-5 border-b border-slate-200 bg-slate-50/50 flex flex-col lg:flex-row items-center justify-between gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 w-full lg:max-w-4xl">
                {/* Filter 1 */}
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
                  <input
                    type="text"
                    placeholder="Filter Teacher ID"
                    value={filterId}
                    onChange={(e) => setFilterId(e.target.value)}
                    className="w-full bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-700 outline-none transition"
                  />
                </div>
                {/* Filter 2 */}
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
                  <input
                    type="text"
                    placeholder="Filter Department"
                    value={filterDept}
                    onChange={(e) => setFilterDept(e.target.value)}
                    className="w-full bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-700 outline-none transition"
                  />
                </div>
                {/* Filter 3 */}
                <div className="relative">
                  <Calendar className="absolute left-3 top-2.5 text-slate-400" size={14} />
                  <input
                    type="date"
                    value={filterDateFrom}
                    onChange={(e) => setFilterDateFrom(e.target.value)}
                    className="w-full bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-700 outline-none transition"
                  />
                </div>
                {/* Filter 4 */}
                <div className="relative">
                  <Calendar className="absolute left-3 top-2.5 text-slate-400" size={14} />
                  <input
                    type="date"
                    value={filterDateTo}
                    onChange={(e) => setFilterDateTo(e.target.value)}
                    className="w-full bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-700 outline-none transition"
                  />
                </div>
              </div>

              <div className="flex gap-2 w-full lg:w-auto justify-end">
                <button
                  onClick={fetchDashboardData}
                  disabled={isLoading}
                  className="bg-white hover:bg-slate-50 border border-slate-200 p-2 rounded-lg text-slate-500 transition shadow-sm"
                  title="Refresh logs"
                >
                  <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
                </button>
                <button
                  onClick={exportToCSV}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition shadow-sm shadow-emerald-500/10"
                >
                  <FileSpreadsheet size={15} />
                  Export CSV
                </button>
              </div>
            </div>

            {/* Logs Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
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
                <tbody className="divide-y divide-slate-100">
                  {isLoading ? (
                    <tr>
                      <td colSpan="8" className="p-8 text-center text-slate-400">
                        <RefreshCw className="animate-spin inline-block mr-2 text-indigo-500" size={16} />
                        Loading attendance database records...
                      </td>
                    </tr>
                  ) : logs.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="p-8 text-center text-slate-400">
                        No matching attendance logs found.
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/40 text-slate-600 transition">
                        <td className="p-4">
                          <div className="font-bold text-slate-800">{log.teacher_name}</div>
                          <div className="text-[9px] text-slate-400 font-mono mt-0.5">{log.teacher_id}</div>
                        </td>
                        <td className="p-4 text-slate-505">{log.teacher_department}</td>
                        <td className="p-4 text-slate-505">{log.date}</td>
                        <td className="p-4 font-mono text-slate-505">
                          {new Date(log.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                        <td className="p-4 font-mono text-slate-505">
                          {log.check_out_time 
                            ? new Date(log.check_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) 
                            : '—'}
                        </td>
                        <td className="p-4 font-semibold text-indigo-600">
                          {log.total_working_hours !== null ? `${log.total_working_hours.toFixed(2)}h` : '—'}
                        </td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded-full font-bold text-[9px] border ${
                            log.status === 'CHECKED_IN'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                              : log.status === 'COMPLETED' || log.status === 'CHECKED_OUT'
                              ? 'bg-sky-50 text-sky-700 border-sky-100'
                              : 'bg-rose-50 text-rose-705 border-rose-100'
                          }`}>
                            {log.status}
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          <button
                            onClick={() => handleDeleteLog(log.id)}
                            className="text-rose-500 hover:text-rose-600 p-1 hover:bg-rose-50 rounded-lg transition"
                            title="Delete log record"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            {/* Teachers Header search bar */}
            <div className="p-5 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between gap-4">
              <div className="relative w-full max-w-md">
                <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
                <input
                  type="text"
                  placeholder="Search by ID, Name or Department"
                  value={teacherSearch}
                  onChange={(e) => setTeacherSearch(e.target.value)}
                  className="w-full bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-700 outline-none transition"
                />
              </div>
              <button
                onClick={fetchDashboardData}
                disabled={isLoading}
                className="bg-white hover:bg-slate-50 border border-slate-200 p-2 rounded-lg text-slate-500 transition shadow-sm"
                title="Refresh lists"
              >
                <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
              </button>
            </div>

            {/* Teachers Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="p-4">Teacher ID</th>
                    <th className="p-4">Name</th>
                    <th className="p-4">Department</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoading ? (
                    <tr>
                      <td colSpan="5" className="p-8 text-center text-slate-400">
                        <RefreshCw className="animate-spin inline-block mr-2 text-indigo-500" size={16} />
                        Loading registered faculty records...
                      </td>
                    </tr>
                  ) : filteredTeachers.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="p-8 text-center text-slate-400">
                        No registered faculty members found.
                      </td>
                    </tr>
                  ) : (
                    filteredTeachers.map((t) => (
                      <tr key={t.teacher_id} className="hover:bg-slate-50/40 text-slate-600 transition">
                        <td className="p-4 font-mono font-bold text-indigo-600">{t.teacher_id}</td>
                        <td className="p-4 font-bold text-slate-800">{t.name}</td>
                        <td className="p-4 text-slate-505">{t.department || 'N/A'}</td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded-full font-bold text-[9px] border ${
                            t.is_active
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                              : 'bg-slate-50 text-slate-500 border-slate-100'
                          }`}>
                            {t.is_active ? 'ACTIVE' : 'INACTIVE'}
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          <button
                            onClick={() => handleDeleteTeacher(t.teacher_id, t.name)}
                            className="text-rose-500 hover:text-rose-600 p-1.5 hover:bg-rose-50 rounded-lg transition"
                            title="Delete faculty profile"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Manual Override Modal Overlay */}
      {showOverrideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="glass-panel p-6 rounded-2xl w-full max-w-md shadow-xl border border-slate-200 bg-white relative">
            <h3 className="text-base font-bold text-slate-800 mb-4">Manual Attendance Session Override</h3>
            
            <form onSubmit={handleSaveOverride} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-450 uppercase mb-1.5">Select Teacher</label>
                <select
                  value={overrideData.teacherId}
                  onChange={(e) => setOverrideData({ ...overrideData, teacherId: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm text-slate-700 outline-none focus:bg-white focus:border-indigo-500 transition"
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
                <label className="block text-[10px] font-bold text-slate-455 uppercase mb-1.5">Check-In Datetime</label>
                <input
                  type="datetime-local"
                  value={overrideData.checkInTime}
                  onChange={(e) => setOverrideData({ ...overrideData, checkInTime: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm text-slate-700 outline-none font-mono focus:bg-white focus:border-indigo-500 transition"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-455 uppercase mb-1.5">Check-Out Datetime (Optional)</label>
                <input
                  type="datetime-local"
                  value={overrideData.checkOutTime}
                  onChange={(e) => setOverrideData({ ...overrideData, checkOutTime: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm text-slate-700 outline-none font-mono focus:bg-white focus:border-indigo-500 transition"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-455 uppercase mb-1.5">Session Status</label>
                <select
                  value={overrideData.status}
                  onChange={(e) => setOverrideData({ ...overrideData, status: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm text-slate-700 outline-none focus:bg-white focus:border-indigo-550 transition"
                >
                  <option value="CHECKED_IN">CHECKED_IN (Open Session)</option>
                  <option value="COMPLETED">COMPLETED (Closed Session)</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2 justify-end text-xs">
                <button
                  type="button"
                  onClick={() => setShowOverrideModal(false)}
                  className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-500 px-4 py-2 rounded-lg font-semibold transition shadow-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingOverride}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-semibold flex items-center gap-1.5 shadow-md shadow-indigo-500/10 transition"
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
