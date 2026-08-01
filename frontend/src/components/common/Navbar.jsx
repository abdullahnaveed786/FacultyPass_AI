import React from 'react';
import { Camera, UserPlus, Database, Shield } from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab }) {
  const navItems = [
    { id: 'kiosk', label: 'Doorway Kiosk', icon: Camera },
    { id: 'enrollment', label: 'Faculty Enrollment', icon: UserPlus },
    { id: 'dashboard', label: 'Admin Dashboard', icon: Database },
  ];

  return (
    <nav className="glass-panel border-b border-slate-200/80 sticky top-0 z-40 bg-white/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo Brand */}
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-600 rounded-xl text-white font-bold shadow-md shadow-indigo-500/10">
              <Shield size={20} className="text-white" />
            </div>
            <div>
              <span className="font-extrabold text-base tracking-wide bg-gradient-to-r from-indigo-600 to-indigo-800 bg-clip-text text-transparent">
                FacultyPass AI
              </span>
              <span className="text-[9px] block text-slate-400 font-mono tracking-widest uppercase">Doorway Biometrics</span>
            </div>
          </div>

          {/* Navigation Items */}
          <div className="flex items-center gap-1 sm:gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2 px-3 py-2 sm:px-4 rounded-xl text-xs font-semibold tracking-wide transition-all ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-600 border border-indigo-100 shadow-sm shadow-indigo-500/5'
                      : 'text-slate-500 hover:text-slate-800 border border-transparent hover:bg-slate-100/80'
                  }`}
                >
                  <Icon size={15} />
                  <span className="hidden sm:inline">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
