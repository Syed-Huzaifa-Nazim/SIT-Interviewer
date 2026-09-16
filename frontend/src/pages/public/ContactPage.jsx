import React, { useState } from 'react';
import PublicLayout from '../../layouts/PublicLayout';
import PageHero from './PageHero';
import Card from '../../components/ui/Card';
import Reveal from '../../components/ui/Reveal';
import Alert from '../../components/ui/Alert';
import Button from '../../components/ui/Button';
import { ShieldCheck, Monitor, Clock, Send } from 'lucide-react';

const ContactPage = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name || !email || !message) return;
    setSuccess('Ticket submitted successfully! An admission officer will contact you shortly.');
    setName(''); setEmail(''); setMessage('');
    setTimeout(() => setSuccess(''), 6000);
  };

  const inputClass = 'text-xs py-2 px-3 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-primary-500';

  return (
    <PublicLayout>
      <PageHero
        eyebrow="Contact Helpdesk"
        title="Admissions & Helpdesk Support"
        subtitle="Have queries about pre-assessments, token funding, or proctor logs? Get in touch."
      />
      <section className="max-w-7xl mx-auto px-6 py-20">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-8 items-start">
          <Reveal className="md:col-span-2">
            <Card className="p-6 space-y-6 border border-slate-200 dark:border-slate-800">
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Support Directory</h3>
              <div className="space-y-4 text-xs text-slate-600 dark:text-slate-300">
                <div className="flex items-start gap-3">
                  <ShieldCheck size={16} className="text-primary-500 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-bold text-slate-800 dark:text-slate-200">Helpdesk Email</h5>
                    <p className="mt-0.5">admissions-helpdesk@saylanimit.com</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Monitor size={16} className="text-accent-500 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-bold text-slate-800 dark:text-slate-200">Official Location</h5>
                    <p className="mt-0.5">SMIT Central Headquarters, Karachi, Pakistan</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Clock size={16} className="text-indigo-500 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-bold text-slate-800 dark:text-slate-200">Hours of Operation</h5>
                    <p className="mt-0.5">Monday to Saturday: 9:00 AM - 6:00 PM PST</p>
                  </div>
                </div>
              </div>
            </Card>
          </Reveal>

          <Reveal className="md:col-span-3" delay={100}>
            <Card className="p-6 border border-slate-200 dark:border-slate-800">
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200 mb-6">Send an Inquiry</h3>
              {success ? (
                <Alert variant="success" className="font-bold text-xs py-4">{success}</Alert>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Your Name</label>
                      <input type="text" required className={inputClass} placeholder="Fahad" value={name} onChange={(e) => setName(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Email Address</label>
                      <input type="email" required className={inputClass} placeholder="fahad@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Message Body</label>
                    <textarea required className={`${inputClass} min-h-[120px] resize-none`} placeholder="Write your query here..." value={message} onChange={(e) => setMessage(e.target.value)} />
                  </div>
                  <div className="flex justify-end pt-2">
                    <Button type="submit" size="sm" icon={Send}>Submit Inquiry</Button>
                  </div>
                </form>
              )}
            </Card>
          </Reveal>
        </div>
      </section>
    </PublicLayout>
  );
};

export default ContactPage;
