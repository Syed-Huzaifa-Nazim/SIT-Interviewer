import React, { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import BrandLogo from '../components/layout/BrandLogo';
import ThemeToggle from '../components/layout/ThemeToggle';
import { Menu, X } from 'lucide-react';

export const PUBLIC_NAV_LINKS = [
  { to: '/features', label: 'Program Features' },
  { to: '/demo', label: 'Evaluation Demo' },
  { to: '/technology', label: 'Technology Stack' },
  { to: '/about', label: 'About' },
  { to: '/pricing', label: 'Student Pricing' },
  { to: '/contact', label: 'Contact Helpdesk' },
];

/**
 * Shared chrome for all public marketing pages: routed navbar (real pages, not anchor
 * scroll — §5), a global theme toggle (§8), and footer. Keeps branding consistent
 * across the landing page and every dedicated sub-page.
 */
const PublicLayout = ({ children }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const linkClass = ({ isActive }) =>
    `transition cursor-pointer ${
      isActive
        ? 'text-primary-600 dark:text-primary-400'
        : 'hover:text-primary-600 dark:hover:text-primary-400'
    }`;

  return (
    <div className="bg-white dark:bg-slate-950 min-h-screen flex flex-col font-sans text-slate-800 dark:text-slate-200 selection:bg-accent-500/30">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md border-b border-slate-100 dark:border-slate-800 transition-all">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" aria-label="Home">
            <BrandLogo />
          </Link>

          <div className="hidden lg:flex items-center gap-8 text-sm font-semibold text-slate-600 dark:text-slate-300">
            {PUBLIC_NAV_LINKS.map((link) => (
              <NavLink key={link.to} to={link.to} className={linkClass}>
                {link.label}
              </NavLink>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link to="/login" className="hidden sm:inline-flex text-sm font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400 transition">
              Student Login
            </Link>
            <Link to="/register" className="hidden sm:inline-flex bg-primary-600 hover:bg-primary-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold shadow-sm transition">
              Enroll Now
            </Link>
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="lg:hidden p-2 text-slate-600 dark:text-slate-300">
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950 px-6 py-4 space-y-3">
            {PUBLIC_NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                onClick={() => setMobileMenuOpen(false)}
                className="block text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-primary-600 dark:hover:text-primary-400"
              >
                {link.label}
              </NavLink>
            ))}
            <div className="flex gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <Link to="/login" onClick={() => setMobileMenuOpen(false)} className="flex-1 text-center text-sm font-semibold text-primary-600 dark:text-primary-400 border border-slate-200 dark:border-slate-800 rounded-lg py-2">
                Login
              </Link>
              <Link to="/register" onClick={() => setMobileMenuOpen(false)} className="flex-1 text-center bg-primary-600 text-white rounded-lg py-2 text-sm font-semibold">
                Enroll
              </Link>
            </div>
          </div>
        )}
      </nav>

      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 py-12 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center px-6 gap-4">
          <BrandLogo size="sm" />
          <div className="flex flex-wrap gap-x-6 gap-y-2 font-semibold justify-center">
            {PUBLIC_NAV_LINKS.map((link) => (
              <Link key={link.to} to={link.to} className="hover:text-primary-600 dark:hover:text-primary-400 transition">
                {link.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-6 pt-8 border-t border-slate-200 dark:border-slate-800 mt-8 text-[11px]">
          <p>&copy; {new Date().getFullYear()} SMIT Interviewer AI — Designed for Professional Certification &amp; Readiness.</p>
        </div>
      </footer>
    </div>
  );
};

export default PublicLayout;
