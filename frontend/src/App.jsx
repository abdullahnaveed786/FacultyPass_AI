import React, { useState } from 'react';
import Navbar from './components/common/Navbar';
import Kiosk from './components/kiosk/Kiosk';
import EnrollmentWizard from './components/enrollment/EnrollmentWizard';
import AdminDashboard from './components/dashboard/AdminDashboard';
import { NotificationProvider } from './context/NotificationContext';
import { AuthProvider } from './context/AuthContext';

function DashboardContainer() {
  const [activeTab, setActiveTab] = useState('kiosk'); // 'kiosk', 'enrollment', 'dashboard'

  return (
    <div className="min-h-screen bg-slate-50 text-slate-600 flex flex-col relative pb-12">
      {/* Decorative gradient glowing spots */}
      <div className="absolute top-[10%] left-[5%] w-80 h-80 bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-[20%] right-[10%] w-96 h-96 bg-sky-500/5 rounded-full blur-[120px] pointer-events-none"></div>

      {/* Navigation Header */}
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Panel Content */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 relative z-10">
        {activeTab === 'kiosk' && <Kiosk />}
        {activeTab === 'enrollment' && <EnrollmentWizard />}
        {activeTab === 'dashboard' && <AdminDashboard />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <NotificationProvider>
      <AuthProvider>
        <DashboardContainer />
      </AuthProvider>
    </NotificationProvider>
  );
}
