import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Phone, Mail, CheckCircle2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { COMPANY } from '@/lib/siteContent';

export default function Contact() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' });
  const [errors, setErrors] = useState({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    const er = {};
    if (!form.name.trim()) er.name = 'Please enter your name.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) er.email = 'Please enter a valid email.';
    if (!form.message.trim()) er.message = 'Please enter a message.';
    setErrors(er);
    if (Object.keys(er).length) return;
    setSending(true);
    try {
      await api.post('/contact', form);
      setSent(true);
    } catch (err) {
      toast.error('Could not send your message. Please try again or call us.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <SiteHeader />
      <main className="flex-1" data-testid="page-contact">
        <div className="bg-[#E8F4F7] border-b border-slate-200">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
            <button onClick={() => navigate('/')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4" data-testid="contact-back">
              <ArrowLeft className="h-4 w-4" /> Back to home
            </button>
            <h1 className="font-slab font-extrabold text-3xl sm:text-4xl text-slate-900">Contact Us</h1>
            <p className="mt-2 text-slate-600">Questions about your lemon-law claim? Send us a message and we'll get right back to you.</p>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 grid lg:grid-cols-5 gap-8">
          {/* Contact form */}
          <div className="lg:col-span-3">
            {sent ? (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center" data-testid="contact-success">
                <div className="mx-auto h-14 w-14 rounded-full bg-emerald-50 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                </div>
                <h2 className="mt-4 font-slab font-bold text-2xl text-slate-900">Message sent!</h2>
                <p className="mt-2 text-slate-600">Thanks for reaching out — we'll reply to your email shortly.</p>
                <Button onClick={() => { setSent(false); setForm({ name: '', email: '', phone: '', message: '' }); }} className="mt-6 rounded-xl bg-[#EF4444] hover:bg-[#DC2626] text-white" data-testid="contact-send-another">
                  Send another message
                </Button>
              </div>
            ) : (
              <form onSubmit={submit} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 grid gap-4">
                <h2 className="font-slab font-bold text-xl text-slate-900">Send us a message</h2>
                <div>
                  <Label htmlFor="name" className="text-slate-700">Full Name</Label>
                  <Input id="name" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Jane Smith"
                    className="mt-1.5 h-12 rounded-xl border-slate-200 focus-visible:ring-2 focus-visible:ring-sky-300" data-testid="contact-name-input" />
                  {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="email" className="text-slate-700">Email</Label>
                    <Input id="email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="jane@email.com"
                      className="mt-1.5 h-12 rounded-xl border-slate-200 focus-visible:ring-2 focus-visible:ring-sky-300" data-testid="contact-email-input" />
                    {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email}</p>}
                  </div>
                  <div>
                    <Label htmlFor="phone" className="text-slate-700">Phone (optional)</Label>
                    <Input id="phone" type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="(818) 555-1212"
                      className="mt-1.5 h-12 rounded-xl border-slate-200 focus-visible:ring-2 focus-visible:ring-sky-300" data-testid="contact-phone-input" />
                  </div>
                </div>
                <div>
                  <Label htmlFor="message" className="text-slate-700">Message</Label>
                  <Textarea id="message" rows={5} value={form.message} onChange={(e) => set('message', e.target.value)} placeholder="How can we help?"
                    className="mt-1.5 rounded-xl border-slate-200 focus-visible:ring-2 focus-visible:ring-sky-300" data-testid="contact-message-input" />
                  {errors.message && <p className="mt-1 text-sm text-red-600">{errors.message}</p>}
                </div>
                <Button type="submit" disabled={sending} className="h-12 rounded-xl bg-[#EF4444] hover:bg-[#DC2626] text-white font-semibold disabled:opacity-70" data-testid="contact-submit-button">
                  <Send className="h-4 w-4 mr-2" /> {sending ? 'Sending\u2026' : 'Send Message'}
                </Button>
              </form>
            )}
          </div>

          {/* Company info box */}
          <div className="lg:col-span-2">
            <div className="bg-slate-900 text-white rounded-2xl p-6 sm:p-7" data-testid="contact-company-box">
              <h2 className="font-slab font-bold text-xl">Lemon Pros</h2>
              <p className="text-slate-300 text-sm mt-1">Lemon law specialists fighting for defective-vehicle owners.</p>
              <div className="mt-6 grid gap-5">
                <a href={COMPANY.mapsUrl} target="_blank" rel="noreferrer" className="flex items-start gap-3 group" data-testid="contact-address">
                  <span className="h-9 w-9 rounded-lg bg-white/10 flex items-center justify-center shrink-0"><MapPin className="h-5 w-5 text-[#FACC15]" /></span>
                  <span>
                    <span className="block text-xs uppercase tracking-wide text-slate-400">Address</span>
                    <span className="text-sm text-white group-hover:underline">{COMPANY.addressLine1}<br />{COMPANY.addressLine2}</span>
                  </span>
                </a>
                <a href={COMPANY.phoneHref} className="flex items-start gap-3 group" data-testid="contact-phone-link">
                  <span className="h-9 w-9 rounded-lg bg-white/10 flex items-center justify-center shrink-0"><Phone className="h-5 w-5 text-[#FACC15]" /></span>
                  <span>
                    <span className="block text-xs uppercase tracking-wide text-slate-400">Phone</span>
                    <span className="text-sm text-white group-hover:underline">{COMPANY.phone}</span>
                  </span>
                </a>
                <a href={`mailto:${COMPANY.contactEmail}`} className="flex items-start gap-3 group" data-testid="contact-email-link">
                  <span className="h-9 w-9 rounded-lg bg-white/10 flex items-center justify-center shrink-0"><Mail className="h-5 w-5 text-[#FACC15]" /></span>
                  <span>
                    <span className="block text-xs uppercase tracking-wide text-slate-400">Email</span>
                    <span className="text-sm text-white group-hover:underline break-all">{COMPANY.contactEmail}</span>
                  </span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
