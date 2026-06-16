import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { api, TOKEN_KEY, setSession } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/Logo';

export default function AdminLogin() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(TOKEN_KEY)) {
      navigate('/admin/dashboard', { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/admin/login', { username: username.trim(), password });
      setSession({ token: res.data.token, role: res.data.role, username: res.data.username });
      navigate('/admin/dashboard');
    } catch (err) {
      setError('Incorrect username or password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4" data-testid="page-admin-login">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-6">
          <Logo size="lg" />
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_12px_30px_rgba(15,23,42,0.10)] p-7">
          <div className="flex items-center gap-2 mb-1">
            <Lock className="h-5 w-5 text-slate-700" />
            <h1 className="font-slab font-bold text-xl text-slate-900">Admin Login</h1>
          </div>
          <p className="text-sm text-slate-500 mb-5">Manage leads, hooks, metrics and settings.</p>
          <form onSubmit={submit} className="grid gap-4">
            <div>
              <Label htmlFor="username" className="text-slate-700">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="owner (leave blank for owner)"
                className="mt-1.5 h-11 rounded-xl border-slate-200 focus-visible:ring-2 focus-visible:ring-sky-300"
                data-testid="admin-username-input"
              />
            </div>
            <div>
              <Label htmlFor="password" className="text-slate-700">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="mt-1.5 h-11 rounded-xl border-slate-200 focus-visible:ring-2 focus-visible:ring-sky-300"
                data-testid="admin-password-input"
              />
              {error && <p className="mt-1 text-sm text-red-600" data-testid="admin-login-error">{error}</p>}
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="h-11 rounded-xl bg-[#EF4444] hover:bg-[#DC2626] text-white font-semibold transition-colors disabled:opacity-70"
              data-testid="admin-login-submit-button"
            >
              {loading ? 'Signing in\u2026' : 'Sign In'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
