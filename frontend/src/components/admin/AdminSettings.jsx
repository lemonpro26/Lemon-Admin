import React, { useState } from 'react';
import { Bell, Users as UsersIcon, Mail, Plug } from 'lucide-react';
import { AdminNotifications } from '@/components/admin/AdminNotifications';
import { AdminUsers } from '@/components/admin/AdminUsers';
import { AdminEmailTemplate } from '@/components/admin/AdminEmailTemplate';
import { AdminIntegrations } from '@/components/admin/AdminIntegrations';

const TABS = [
  { key: 'integrations', label: 'Integrations', icon: Plug },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'users', label: 'Users', icon: UsersIcon },
  { key: 'email', label: 'Thank-You Email', icon: Mail },
];

export const AdminSettings = ({ canEdit }) => {
  const [tab, setTab] = useState('integrations');
  return (
    <div className="grid gap-5" data-testid="admin-settings">
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${active ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'}`}
              data-testid={`settings-tab-${t.key}`}
            >
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </div>
      {tab === 'integrations' && <AdminIntegrations />}
      {tab === 'notifications' && <AdminNotifications canEdit={canEdit} />}
      {tab === 'users' && <AdminUsers canEdit={canEdit} />}
      {tab === 'email' && <AdminEmailTemplate canEdit={canEdit} />}
    </div>
  );
};
