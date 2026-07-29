import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import PublicLayout from '../layouts/PublicLayout';
import { LANDING_CSS, LANDING_HTML } from './landingContent';

/**
 * Public landing page. The animated marketing content lives as a self-contained,
 * `.lp`-scoped block (markup + styles in landingContent.js) so its generic selectors
 * never leak into the rest of the app. Dark mode follows the global ThemeContext
 * (`html.dark`). All the live visuals (radar, scoring ring, tickers, interactive
 * walkthrough, scroll reveals) are driven here in one effect with full cleanup.
 */
const LandingPage = () => {
  const rootRef = useRef(null);
  const navigate = useNavigate();

  // Client-side navigation for the in-content CTAs (they are plain anchors inside the
  // injected markup, so intercept their clicks and route through React Router).
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const onClick = (e) => {
      const a = e.target.closest('a[data-route]');
      if (a) {
        e.preventDefault();
        navigate(a.getAttribute('data-route'));
      }
    };
    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
  }, [navigate]);

  // All the live animations.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timers = [];
    const rafs = [];
    const $ = (s) => root.querySelector(s);
    const $$ = (s) => Array.from(root.querySelectorAll(s));

    // count-up helper
    const count = (el) => {
      const t = parseFloat(el.dataset.t);
      const suf = el.dataset.suf || '';
      if (rm) { el.textContent = t + suf; return; }
      let start = null;
      const step = (ts) => {
        if (!start) start = ts;
        const p = Math.min(1, (ts - start) / 1100);
        const e = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(t * e) + suf;
        if (p < 1) rafs.push(requestAnimationFrame(step));
      };
      rafs.push(requestAnimationFrame(step));
    };

    // scroll reveal
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        en.target.classList.add('in');
        en.target.querySelectorAll('[data-t]').forEach(count);
        io.unobserve(en.target);
      });
    }, { threshold: 0.18 });
    $$('.rv').forEach((n) => io.observe(n));

    // typing answer
    const ansEl = $('[data-type]');
    if (ansEl) {
      const txt = "I'd measure where the time goes first, add an index on the hot lookup, cache the read path, and only shard once a single node truly can't keep up…";
      if (rm) { ansEl.textContent = txt; }
      else {
        let i = 0;
        const type = () => {
          if (i <= txt.length) {
            ansEl.innerHTML = txt.slice(0, i) + '<span class="caret"></span>';
            i += 1;
            timers.push(setTimeout(type, 28));
          }
        };
        timers.push(setTimeout(type, 700));
      }
    }

    // hero proctoring checks light up
    $$('[data-chk] div').forEach((d, n) => {
      if (rm) { d.classList.add('on'); }
      else timers.push(setTimeout(() => d.classList.add('on'), 700 + n * 450));
    });

    // hero meter bars
    timers.push(setTimeout(() => {
      $$('.pc-l .bar i').forEach((b) => { b.style.width = b.dataset.w + '%'; });
    }, rm ? 0 : 900));

    // radar
    const rc = $('[data-radar]');
    if (rc) {
      const x = rc.getContext('2d');
      let W = 0; let H = 0; let ang = 0;
      const blips = [];
      const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
      const rs = () => { W = rc.width = rc.offsetWidth * devicePixelRatio; H = rc.height = rc.offsetHeight * devicePixelRatio; };
      rs();
      window.addEventListener('resize', rs);
      for (let i = 0; i < 5; i += 1) blips.push({ a: Math.random() * 6.28, r: 0.32 + Math.random() * 0.55 });
      const rdraw = () => {
        const cx = W / 2; const cy = H * 0.7; const R = Math.min(W / 2, H) * 0.92; const g = css('--green') || '#5aa310';
        x.clearRect(0, 0, W, H);
        x.lineWidth = devicePixelRatio; x.strokeStyle = css('--line-2'); x.globalAlpha = 0.65;
        for (let k = 1; k <= 3; k += 1) { x.beginPath(); x.arc(cx, cy, R * k / 3, Math.PI, 2 * Math.PI); x.stroke(); }
        x.beginPath(); x.moveTo(cx - R, cy); x.lineTo(cx + R, cy); x.stroke();
        x.globalAlpha = 1;
        const gx = cx + Math.cos(-ang) * R; const gy = cy + Math.sin(-ang) * R;
        const grad = x.createLinearGradient(cx, cy, gx, gy);
        grad.addColorStop(0, g); grad.addColorStop(1, 'transparent');
        x.strokeStyle = grad; x.lineWidth = 2.2 * devicePixelRatio;
        x.beginPath(); x.moveTo(cx, cy); x.lineTo(gx, gy); x.stroke();
        blips.forEach((b) => {
          const bx = cx + Math.cos(-b.a) * R * b.r; const by = cy - Math.abs(Math.sin(-b.a)) * R * b.r;
          const d = ((ang - b.a) % 6.28 + 6.28) % 6.28; const lit = d < 0.6 ? 1 : 0.22;
          x.globalAlpha = lit; x.fillStyle = g;
          x.beginPath(); x.arc(bx, by, 3 * devicePixelRatio, 0, 7); x.fill();
        });
        x.globalAlpha = 1; ang += 0.018; if (ang > 6.28) ang -= 6.28;
        if (!rm) rafs.push(requestAnimationFrame(rdraw));
      };
      rdraw();
      const mm = $('[data-matchm]');
      if (mm && !rm) timers.push(setInterval(() => { mm.textContent = 'MATCH ' + (96 + Math.floor(Math.random() * 4)) + '%'; }, 1600));
    }

    // scoring ring + bars
    const rcirc = $('[data-ring]'); const rnum = $('[data-ringnum]');
    if (rcirc && rnum) {
      const circ = 326.7; const target = 82;
      if (rm) { rcirc.style.strokeDashoffset = String(circ * (1 - target / 100)); rnum.textContent = target; }
      else {
        timers.push(setTimeout(() => {
          let st = null;
          const f = (ts) => {
            if (!st) st = ts;
            const p = Math.min(1, (ts - st) / 1300); const e = 1 - Math.pow(1 - p, 3);
            rcirc.style.strokeDashoffset = String(circ * (1 - (target / 100) * e));
            rnum.textContent = String(Math.round(target * e));
            if (p < 1) rafs.push(requestAnimationFrame(f));
          };
          rafs.push(requestAnimationFrame(f));
        }, 700));
      }
      timers.push(setTimeout(() => { $$('.rbar .t i').forEach((b) => { b.style.width = b.dataset.w + '%'; }); }, rm ? 0 : 700));
    }

    // proctoring chips + strike
    const chips = $$('[data-pchips] .pchip'); const pips = $$('[data-pips] i'); const so = $('[data-strikeout]');
    if (chips.length && !rm) {
      let strk = 0;
      timers.push(setInterval(() => {
        const idx = Math.floor(Math.random() * chips.length);
        chips.forEach((c) => c.classList.remove('warn'));
        chips[idx].classList.add('warn');
        strk = (strk % 4) + 1;
        pips.forEach((p, i) => p.classList.toggle('on', i < strk));
        if (so) so.classList.toggle('show', strk >= 4);
        timers.push(setTimeout(() => chips[idx].classList.remove('warn'), 1100));
      }, 1500));
    }

    // admin log ticker
    const al = $('[data-alog]');
    if (al) {
      const lines = [['00:02', 'g', 'Identity baseline locked'], ['00:14', 'g', 'Entire screen confirmed'], ['02:41', 'w', 'Gaze away 1.1s'],
        ['04:12', 'w', 'Phone detected 96%'], ['04:13', '', 'Snapshot archived'], ['06:02', 'g', 'Identity re-check OK'], ['08:20', '', 'Answer scored 82']];
      let ai = 0;
      const apush = () => {
        const l = lines[ai % lines.length];
        const d = document.createElement('div');
        d.className = 'r ' + l[1];
        d.innerHTML = '<t>' + l[0] + '</t><span>' + l[2] + '</span>';
        al.appendChild(d);
        if (al.children.length > 4) al.removeChild(al.firstChild);
        ai += 1;
      };
      for (let z = 0; z < 4; z += 1) apush();
      if (!rm) timers.push(setInterval(apush, 2000));
    }

    // interactive walkthrough
    const wt = $$('.wtab'); const wp = $$('.wpanel'); const wl = $('[data-wslabel]');
    const labels = ['device_check', 'identity', 'session', 'report'];
    if (wt.length) {
      let wc = 0; let wauto = null;
      const setW = (n) => {
        wc = n;
        wt.forEach((t, i) => t.classList.toggle('on', i === n));
        wp.forEach((p, i) => p.classList.toggle('on', i === n));
        if (wl) wl.textContent = labels[n];
      };
      const tick = () => setW((wc + 1) % wt.length);
      const startAuto = () => { if (!rm) { wauto = setInterval(tick, 3400); timers.push(wauto); } };
      wt.forEach((t) => t.addEventListener('click', () => {
        setW(parseInt(t.dataset.w, 10));
        if (wauto) clearInterval(wauto);
        startAuto();
      }));
      startAuto();
    }

    return () => {
      timers.forEach((t) => { clearTimeout(t); clearInterval(t); });
      rafs.forEach((r) => cancelAnimationFrame(r));
      io.disconnect();
    };
  }, []);

  return (
    <PublicLayout>
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: LANDING_CSS }} />
      <div className="lp" ref={rootRef}>
        {/* eslint-disable-next-line react/no-danger */}
        <div dangerouslySetInnerHTML={{ __html: LANDING_HTML }} />
      </div>
    </PublicLayout>
  );
};

export default LandingPage;
