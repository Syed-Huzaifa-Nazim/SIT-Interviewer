// Standalone animated landing content for LandingPage.jsx.
//
// The markup + styles come from the approved design mockup. Everything is SCOPED under
// `.lp` so these generic selectors (section, h1, .btn, .cell …) can never leak into the
// rest of the app. Dark mode follows the global theme: the app toggles `html.dark`
// (ThemeContext), and the dark variables below key off `html.dark .lp`.

export const LANDING_CSS = `
.lp{
  --bg:#ffffff; --bg-soft:#f4f7fb; --bg-soft2:#eef3f9; --panel:#ffffff;
  --line:#e4eaf1; --line-2:#d3dde8;
  --ink:#0d1b2a; --ink-2:#4a5b6d; --ink-3:#7d8ea0;
  --blue:#0d6db7; --blue-2:#0a568f; --blue-soft:#e7f1fa;
  --green:#5aa310; --green-2:#4a8a0c; --green-soft:#edf6e0;
  --amber:#b5730a; --danger:#cc3333;
  --r:16px;
  --font:"Segoe UI",-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif;
  --mono:ui-monospace,"Cascadia Code",Consolas,monospace;
  --ease:cubic-bezier(.22,.85,.3,1);
  --sh-sm:0 1px 2px rgba(13,27,42,.05),0 4px 12px -6px rgba(13,27,42,.08);
  --sh-md:0 2px 6px rgba(13,27,42,.06),0 20px 44px -22px rgba(13,27,42,.22);
  --sh-lg:0 30px 80px -40px rgba(10,86,143,.4);
  background:var(--bg); color:var(--ink); font-family:var(--font); line-height:1.6;
  position:relative; overflow-x:hidden; -webkit-font-smoothing:antialiased;
}
html.dark .lp{
  --bg:#0a0f16; --bg-soft:#0e141d; --bg-soft2:#111925; --panel:#121a24;
  --line:#1e2836; --line-2:#2b3848;
  --ink:#eef3f9; --ink-2:#a7b5c4; --ink-3:#6f8091;
  --blue:#3d97e0; --blue-2:#2f7ec2; --blue-soft:#12283c;
  --green:#82c62e; --green-2:#6bad20; --green-soft:#16240f;
  --amber:#e0a13a; --danger:#e5615a;
  --sh-sm:0 1px 2px rgba(0,0,0,.4),0 6px 16px -8px rgba(0,0,0,.6);
  --sh-md:0 2px 8px rgba(0,0,0,.5),0 24px 50px -24px rgba(0,0,0,.7);
  --sh-lg:0 40px 90px -44px rgba(0,0,0,.85);
}
.lp *{box-sizing:border-box}
@media (prefers-reduced-motion:reduce){.lp *{animation:none !important;transition-duration:.001ms !important}}
.lp a{color:inherit;text-decoration:none;cursor:pointer}
.lp ::selection{background:var(--blue);color:#fff}
.lp .shell{width:100%;max-width:1180px;margin:0 auto;padding:0 24px}
.lp .btn{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:8px;height:42px;padding:0 20px;border-radius:11px;
  font-size:14.5px;font-weight:600;cursor:pointer;border:1px solid transparent;transition:.2s var(--ease);white-space:nowrap;overflow:hidden;font-family:inherit}
.lp .btn-p{background:var(--blue);color:#fff}
.lp .btn-p:hover{background:var(--blue-2);transform:translateY(-2px);box-shadow:0 12px 26px -10px color-mix(in srgb,var(--blue) 70%,transparent)}
.lp .btn-s{background:var(--panel);border-color:var(--line-2);color:var(--ink)}
.lp .btn-s:hover{border-color:var(--blue);color:var(--blue);transform:translateY(-2px)}
.lp .btn-lg{height:50px;padding:0 26px;font-size:15.5px;border-radius:13px}

.lp .hero{position:relative;padding:56px 0 40px;overflow:hidden}
.lp .hero-bg{position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(60% 50% at 82% 8%,color-mix(in srgb,var(--green) 12%,transparent),transparent 70%),
             radial-gradient(55% 55% at 8% 6%,color-mix(in srgb,var(--blue) 13%,transparent),transparent 68%)}
.lp .hero-grid{position:relative;display:grid;grid-template-columns:1fr;gap:44px;align-items:center}
@media(min-width:960px){.lp .hero-grid{grid-template-columns:1.02fr .98fr;gap:40px}}
.lp .badge{display:inline-flex;align-items:center;gap:9px;height:32px;padding:0 14px 0 6px;border-radius:99px;background:var(--panel);
  border:1px solid var(--line);box-shadow:var(--sh-sm);font-size:12.5px;font-weight:600;color:var(--ink-2);margin-bottom:24px;
  opacity:0;transform:translateY(10px);animation:lpRise .7s var(--ease) .05s forwards}
.lp .badge b{background:var(--green);color:#fff;font-size:10.5px;padding:3px 9px;border-radius:99px;letter-spacing:.03em}
.lp h1{margin:0 0 20px;font-size:clamp(36px,5vw,60px);line-height:1.06;letter-spacing:-.025em;font-weight:760;text-wrap:balance;
  opacity:0;transform:translateY(16px);animation:lpRise .8s var(--ease) .12s forwards}
.lp h1 .u{position:relative;color:var(--blue);white-space:nowrap}
.lp h1 .u svg{position:absolute;left:0;right:0;bottom:-8px;width:100%;height:10px;color:var(--green)}
.lp .u path{stroke-dasharray:260;stroke-dashoffset:260;animation:lpDraw 1s var(--ease) 1s forwards}
.lp .sub{margin:0 0 30px;font-size:clamp(15.5px,1.6vw,18.5px);color:var(--ink-2);max-width:52ch;line-height:1.62;
  opacity:0;animation:lpRise .7s var(--ease) .3s forwards}
.lp .hero-cta{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:26px;opacity:0;animation:lpRise .7s var(--ease) .42s forwards}
.lp .trust{display:flex;align-items:center;gap:16px;flex-wrap:wrap;opacity:0;animation:lpRise .7s var(--ease) .54s forwards}
.lp .trust .av{display:flex}
.lp .trust .av i{width:32px;height:32px;border-radius:99px;border:2.5px solid var(--bg);margin-left:-9px;display:block;background:linear-gradient(135deg,var(--blue),var(--green))}
.lp .trust .av i:first-child{margin-left:0}
.lp .trust p{margin:0;font-size:12.8px;color:var(--ink-3)}
.lp .trust p b{color:var(--ink);font-weight:700}
@keyframes lpRise{to{opacity:1;transform:none}}
@keyframes lpDraw{to{stroke-dashoffset:0}}

.lp .prod{position:relative;opacity:0;transform:translateY(28px) scale(.98);animation:lpRise .9s var(--ease) .5s forwards}
.lp .prod-card{border:1px solid var(--line);border-radius:18px;background:var(--panel);box-shadow:var(--sh-lg);overflow:hidden}
.lp .pc-bar{display:flex;align-items:center;gap:9px;height:40px;padding:0 14px;border-bottom:1px solid var(--line);background:var(--bg-soft)}
.lp .pc-bar .d{width:10px;height:10px;border-radius:99px}
.lp .pc-url{flex:1;text-align:center;font-family:var(--mono);font-size:11px;color:var(--ink-3)}
.lp .rec{display:flex;align-items:center;gap:5px;font-family:var(--mono);font-size:10px;color:var(--danger);font-weight:700}
.lp .rec i{width:6px;height:6px;border-radius:99px;background:var(--danger);animation:lpBlink 1.1s infinite}
@keyframes lpBlink{0%,100%{opacity:1}50%{opacity:.25}}
.lp .pc-body{display:grid;grid-template-columns:1.35fr .9fr}
@media(max-width:520px){.lp .pc-body{grid-template-columns:1fr}}
.lp .pc-l{padding:16px;border-right:1px solid var(--line)}
.lp .pc-r{padding:16px;background:var(--bg-soft)}
.lp .qtag{font-family:var(--mono);font-size:10px;color:var(--blue);font-weight:700;letter-spacing:.05em}
.lp .qbox{border:1px solid var(--line);border-left:3px solid var(--blue);border-radius:10px;background:var(--bg);padding:13px;margin:8px 0 12px}
.lp .qbox p{margin:0;font-size:13.5px;font-weight:600;line-height:1.4;letter-spacing:-.01em}
.lp .ans{font-size:12px;color:var(--ink-2);line-height:1.6;min-height:52px}
.lp .caret{display:inline-block;width:2px;height:12px;background:var(--blue);vertical-align:-1px;animation:lpBlink .85s infinite}
.lp .mt{margin-top:10px;display:grid;gap:9px}
.lp .mt .m b{display:flex;justify-content:space-between;font-size:10.5px;color:var(--ink-2);margin-bottom:4px;font-weight:600}
.lp .mt .m b em{font-style:normal;font-family:var(--mono);color:var(--ink)}
.lp .bar{height:6px;border-radius:99px;background:var(--bg-soft2);overflow:hidden}
.lp .bar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--blue),var(--green));width:0;transition:width 1.3s var(--ease)}
.lp .cam{position:relative;aspect-ratio:4/3;border-radius:11px;overflow:hidden;border:1px solid var(--line-2);background:linear-gradient(155deg,#2a3a4c,#18222e);margin-bottom:11px}
.lp .cam .sil{position:absolute;left:50%;bottom:0;transform:translateX(-50%);width:56%;height:74%;
  background:radial-gradient(46% 30% at 50% 20%,#43566b 0,#33445a 60%,transparent 61%),radial-gradient(60% 46% at 50% 100%,#3a4c62 0,#2a3a4c 70%,transparent 71%)}
.lp .cam .brk{position:absolute;left:50%;top:22%;transform:translateX(-50%);width:34%;aspect-ratio:3/4}
.lp .cam .brk i{position:absolute;width:13px;height:13px;border:2px solid var(--green)}
.lp .cam .brk i:nth-child(1){top:0;left:0;border-right:0;border-bottom:0}
.lp .cam .brk i:nth-child(2){top:0;right:0;border-left:0;border-bottom:0}
.lp .cam .brk i:nth-child(3){bottom:0;left:0;border-right:0;border-top:0}
.lp .cam .brk i:nth-child(4){bottom:0;right:0;border-left:0;border-top:0}
.lp .cam .tagm{position:absolute;left:50%;bottom:8px;transform:translateX(-50%);font-family:var(--mono);font-size:9px;color:#dff0c4;background:rgba(0,0,0,.45);padding:2px 8px;border-radius:5px;border:1px solid rgba(130,198,46,.4)}
.lp .cam .scan{position:absolute;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--green),transparent);animation:lpScan 3s var(--ease) infinite}
@keyframes lpScan{0%,100%{top:14%}50%{top:82%}}
.lp .chk{display:flex;flex-direction:column;gap:6px}
.lp .chk div{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--ink-2);font-weight:500;opacity:.4;transition:.4s var(--ease)}
.lp .chk div.on{opacity:1;color:var(--green-2)}
.lp .chk s{width:15px;height:15px;flex:none;border-radius:5px;background:var(--green-soft);color:var(--green-2);display:grid;place-items:center;font-size:9px;text-decoration:none}
.lp .float{position:absolute;background:var(--panel);border:1px solid var(--line);border-radius:12px;box-shadow:var(--sh-md);padding:11px 13px;display:flex;align-items:center;gap:10px;font-size:12px;font-weight:600;z-index:2}
.lp .float s{width:30px;height:30px;flex:none;border-radius:8px;display:grid;place-items:center;text-decoration:none}
.lp .float small{display:block;font-size:10px;color:var(--ink-3);font-weight:500}
.lp .f1{top:-18px;left:-22px;animation:lpBob 4s var(--ease) infinite}
.lp .f2{bottom:20px;right:-26px;animation:lpBob 4.6s var(--ease) infinite .6s}
@media(max-width:1040px){.lp .f1,.lp .f2{display:none}}
@keyframes lpBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}

.lp .strip{border-block:1px solid var(--line);background:var(--bg-soft);padding:22px 0;margin-top:26px}
.lp .strip .shell{display:flex;align-items:center;justify-content:center;gap:14px;flex-wrap:wrap;text-align:center}
.lp .strip p{margin:0;font-size:12.5px;color:var(--ink-3);font-weight:600;letter-spacing:.04em;text-transform:uppercase;width:100%}
.lp .strip span{font-size:14px;font-weight:700;color:var(--ink-2);display:flex;align-items:center;gap:8px;opacity:.85}
.lp .strip span s{width:6px;height:6px;border-radius:99px;background:var(--green);text-decoration:none}

.lp section{position:relative;padding:96px 0}
.lp .eyebrow{display:inline-block;font-size:12.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--blue);background:var(--blue-soft);padding:5px 12px;border-radius:99px;margin:0 0 16px}
.lp h2{margin:0 0 15px;font-size:clamp(28px,3.6vw,42px);line-height:1.1;letter-spacing:-.025em;font-weight:740;text-wrap:balance}
.lp .lede{margin:0;color:var(--ink-2);font-size:17px;max-width:56ch;line-height:1.62}
.lp .sec-h{margin-bottom:48px}
.lp .sec-h.center{text-align:center;max-width:660px;margin-inline:auto}
.lp .band{background:var(--bg-soft);border-block:1px solid var(--line)}

.lp .bento2{display:grid;grid-template-columns:repeat(6,1fr);gap:16px;grid-auto-flow:dense}
.lp .cell{grid-column:span 6;border:1px solid var(--line);border-radius:var(--r);background:var(--panel);padding:22px;position:relative;overflow:hidden;box-shadow:var(--sh-sm);transition:.3s var(--ease);display:flex;flex-direction:column}
.lp .cell:hover{transform:translateY(-4px);box-shadow:var(--sh-md);border-color:var(--line-2)}
@media(min-width:820px){.lp .cell{grid-column:span 2}.lp .cell.big{grid-column:span 3;grid-row:span 2}.lp .cell.wide{grid-column:span 3}}
.lp .cell .ch{display:flex;align-items:center;gap:11px;margin-bottom:6px}
.lp .cell .ci{width:38px;height:38px;flex:none;border-radius:10px;background:var(--blue-soft);color:var(--blue);display:grid;place-items:center}
.lp .cell.gr .ci{background:var(--green-soft);color:var(--green-2)}
.lp .cell h3{margin:0;font-size:16.5px;font-weight:680;letter-spacing:-.015em}
.lp .cell .cd{margin:0 0 15px;font-size:12.8px;color:var(--ink-2);line-height:1.55}
.lp .cell .viz{margin-top:auto}
.lp .radar{position:relative;width:100%;aspect-ratio:16/9;border-radius:12px;overflow:hidden;border:1px solid var(--line);background:radial-gradient(circle at 50% 70%,var(--bg-soft2),var(--bg-soft))}
.lp .radar canvas{position:absolute;inset:0;width:100%;height:100%}
.lp .radar .mm{position:absolute;top:10px;left:12px;font-family:var(--mono);font-size:11px;font-weight:700;color:var(--green-2);background:var(--panel);border:1px solid var(--line);padding:3px 8px;border-radius:6px}
.lp .ring{position:relative;width:120px;height:120px;flex:none}
.lp .ring .rv-num{position:absolute;inset:0;display:grid;place-items:center;font-size:30px;font-weight:780;letter-spacing:-.03em;color:var(--ink);font-variant-numeric:tabular-nums}
.lp .ring circle.prog{transition:stroke-dashoffset .05s linear}
.lp .rbars{display:grid;gap:9px}
.lp .rbar b{display:flex;justify-content:space-between;font-size:10.5px;color:var(--ink-2);font-weight:600;margin-bottom:3px}
.lp .rbar b em{font-style:normal;font-family:var(--mono);color:var(--ink)}
.lp .rbar .t{height:5px;border-radius:99px;background:var(--bg-soft2);overflow:hidden}
.lp .rbar .t i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--blue),var(--green));width:0;transition:width 1.2s var(--ease)}
.lp .pchips{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:14px}
.lp .pchip{display:flex;align-items:center;gap:6px;font-size:11.5px;font-weight:600;padding:6px 11px;border-radius:99px;border:1px solid var(--line);background:var(--bg-soft);color:var(--ink-2);transition:.3s var(--ease)}
.lp .pchip.warn{border-color:color-mix(in srgb,var(--amber) 50%,transparent);background:color-mix(in srgb,var(--amber) 13%,transparent);color:var(--amber);transform:scale(1.04)}
.lp .pchip s{width:6px;height:6px;border-radius:99px;background:currentColor;text-decoration:none}
.lp .strike{display:flex;align-items:center;gap:11px;font-family:var(--mono);font-size:12px;color:var(--ink-2)}
.lp .pips{display:flex;gap:6px}
.lp .pips i{width:24px;height:8px;border-radius:99px;background:var(--bg-soft2);transition:.3s var(--ease)}
.lp .pips i.on{background:linear-gradient(90deg,var(--amber),var(--danger))}
.lp .strike em{margin-left:auto;font-style:normal;color:var(--danger);font-weight:700;font-size:10.5px;letter-spacing:.04em;opacity:0;transition:.3s}
.lp .strike em.show{opacity:1}
.lp .mon{position:relative;border:2px solid var(--line-2);border-radius:10px;aspect-ratio:16/10;background:var(--bg-soft);display:grid;place-items:center;margin-bottom:9px}
.lp .mon .ok{width:44px;height:44px;border-radius:99px;background:var(--green-soft);color:var(--green-2);display:grid;place-items:center;animation:lpPop 2.6s var(--ease) infinite}
@keyframes lpPop{0%,72%,100%{transform:scale(1)}82%{transform:scale(1.14)}}
.lp .mon .lbl{position:absolute;bottom:8px;left:0;right:0;text-align:center;font-family:var(--mono);font-size:9px;color:var(--green-2);font-weight:700;letter-spacing:.03em}
.lp .film{overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent);mask-image:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent)}
.lp .film-t{display:flex;gap:8px;width:max-content;animation:lpScrollx 16s linear infinite}
.lp .frm{width:64px;height:44px;flex:none;border-radius:8px;border:1px solid var(--line);background:linear-gradient(155deg,#2a3a4c,#18222e);position:relative;overflow:hidden}
.lp .frm::after{content:"";position:absolute;left:50%;bottom:0;transform:translateX(-50%);width:52%;height:64%;border-radius:50% 50% 0 0;background:radial-gradient(50% 60% at 50% 34%,#41576d,#2a3a4c 70%,transparent 71%)}
@keyframes lpScrollx{to{transform:translateX(-50%)}}
.lp .alog{border:1px solid var(--line);border-radius:10px;background:var(--bg-soft);overflow:hidden}
.lp .alog .r{display:flex;gap:8px;padding:6px 11px;font-family:var(--mono);font-size:10px;color:var(--ink-2);border-bottom:1px solid var(--line);animation:lpSl .4s var(--ease) both}
.lp .alog .r:last-child{border-bottom:0}
.lp .alog .r t{color:var(--ink-3);text-decoration:none;flex:none}
.lp .alog .r.g{color:var(--green-2)}
.lp .alog .r.w{color:var(--amber)}
@keyframes lpSl{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:none}}

.lp .work{display:grid;grid-template-columns:1fr;gap:22px}
@media(min-width:880px){.lp .work{grid-template-columns:.82fr 1.18fr;align-items:start}}
.lp .wtabs{display:flex;flex-direction:column;gap:10px}
.lp .wtab{display:flex;gap:13px;align-items:flex-start;text-align:left;padding:16px 18px;border-radius:13px;border:1px solid var(--line);background:var(--panel);cursor:pointer;transition:.25s var(--ease);font-family:inherit;color:inherit}
.lp .wtab:hover{border-color:var(--line-2)}
.lp .wtab.on{border-color:color-mix(in srgb,var(--blue) 50%,transparent);background:var(--blue-soft)}
.lp .wtab .wn{width:28px;height:28px;flex:none;border-radius:9px;display:grid;place-items:center;font-family:var(--mono);font-size:12px;border:1px solid var(--line-2);color:var(--ink-3);transition:.25s}
.lp .wtab.on .wn{background:linear-gradient(135deg,var(--blue),var(--green));color:#fff;border-color:transparent}
.lp .wtab h4{margin:0 0 3px;font-size:15px;font-weight:660;letter-spacing:-.015em}
.lp .wtab p{margin:0;font-size:12.6px;color:var(--ink-2);line-height:1.5}
.lp .wstage{border:1px solid var(--line);border-radius:var(--r);background:var(--panel);box-shadow:var(--sh-md);overflow:hidden}
.lp .wsbar{display:flex;align-items:center;gap:8px;height:38px;padding:0 14px;border-bottom:1px solid var(--line);background:var(--bg-soft)}
.lp .wsbar i{width:9px;height:9px;border-radius:99px}
.lp .wsbar span{margin-left:auto;font-family:var(--mono);font-size:10.5px;color:var(--ink-3)}
.lp .wpanels{position:relative;padding:8px 22px}
.lp .wpanel{opacity:0;transform:translateY(12px);transition:.45s var(--ease);position:absolute;inset:8px 22px;pointer-events:none}
.lp .wpanel.on{opacity:1;transform:none;pointer-events:auto;position:relative;inset:auto}
.lp .wrow{display:flex;align-items:center;gap:12px;padding:13px 0;border-bottom:1px solid var(--line);font-size:13.5px;color:var(--ink-2)}
.lp .wrow:last-child{border-bottom:0}
.lp .wrow s{width:24px;height:24px;flex:none;border-radius:7px;background:var(--green-soft);color:var(--green-2);display:grid;place-items:center;text-decoration:none;font-size:11px;font-weight:700}
.lp .wrow em{margin-left:auto;font-style:normal;font-family:var(--mono);font-size:11.5px;color:var(--ink);font-weight:600}
.lp .wrow em.bad{color:var(--danger)}
.lp .wrow em.warn{color:var(--amber)}

.lp .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:20px}
@media(max-width:820px){.lp .stats{grid-template-columns:repeat(2,1fr)}}
.lp .sc{position:relative;text-align:center;padding:30px 18px;border:1px solid var(--line);border-radius:var(--r);background:var(--panel);transition:.3s var(--ease);overflow:hidden}
.lp .sc:hover{transform:translateY(-6px);box-shadow:var(--sh-md);border-color:var(--line-2)}
.lp .sc::before{content:"";position:absolute;top:0;left:50%;transform:translateX(-50%);width:0;height:3px;background:linear-gradient(90deg,var(--blue),var(--green));transition:width .9s var(--ease) .3s}
.lp .sc.in::before{width:56px}
.lp .sc b{display:block;font-size:clamp(34px,4vw,52px);font-weight:780;letter-spacing:-.04em;line-height:1;background:linear-gradient(135deg,var(--blue),var(--green));-webkit-background-clip:text;background-clip:text;color:transparent;font-variant-numeric:tabular-nums}
.lp .sc span{display:block;margin-top:10px;font-size:13.5px;color:var(--ink-2);font-weight:500}

.lp .cta{position:relative;border-radius:24px;overflow:hidden;background:linear-gradient(135deg,var(--blue-2),var(--blue) 55%,var(--green-2));padding:66px 32px;text-align:center;color:#fff;box-shadow:var(--sh-md)}
.lp .cta::after{content:"";position:absolute;inset:0;opacity:.5;pointer-events:none;background:radial-gradient(40% 60% at 85% 15%,rgba(255,255,255,.18),transparent 60%)}
.lp .cta h2{position:relative;color:#fff}
.lp .cta p{position:relative;color:rgba(255,255,255,.9);max-width:48ch;margin:0 auto 28px;font-size:16px}
.lp .cta .row{position:relative;display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.lp .cta .btn-w{background:#fff;color:var(--blue-2)}
.lp .cta .btn-w:hover{transform:translateY(-2px);box-shadow:0 14px 30px -12px rgba(0,0,0,.4)}
.lp .cta .btn-o{background:transparent;border-color:rgba(255,255,255,.55);color:#fff}
.lp .cta .btn-o:hover{background:rgba(255,255,255,.12);transform:translateY(-2px)}

.lp .rv{opacity:0;transform:translateY(28px) scale(.985);filter:blur(7px);transition:opacity .75s var(--ease),transform .75s var(--ease),filter .75s var(--ease)}
.lp .rv.in{opacity:1;transform:none;filter:none}
.lp .rv[data-d="1"]{transition-delay:.08s}.lp .rv[data-d="2"]{transition-delay:.16s}.lp .rv[data-d="3"]{transition-delay:.24s}
.lp .rv[data-d="4"]{transition-delay:.32s}.lp .rv[data-d="5"]{transition-delay:.4s}
`;

export const LANDING_HTML = `
<section class="hero">
  <div class="hero-bg"></div>
  <div class="shell">
    <div class="hero-grid">
      <div class="hero-copy">
        <span class="badge"><b>NEW</b> Identity verified before every interview</span>
        <h1>The end-to-end <span class="u">proctored<svg viewBox="0 0 200 12" fill="none" preserveAspectRatio="none"><path d="M2 8 C50 2, 150 2, 198 7" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg></span> interview platform, built on proof.</h1>
        <p class="sub">Verify who is really sitting the exam, watch every second, and score every answer automatically &mdash; so each result comes with proof, not guesswork.</p>
        <div class="hero-cta">
          <a data-route="/register" class="btn btn-p btn-lg">Get started free</a>
          <a data-route="/features" class="btn btn-s btn-lg">See how it works</a>
        </div>
        <div class="trust">
          <div class="av"><i></i><i></i><i></i><i></i></div>
          <p><b>Built for institutes</b> running high-stakes assessments at scale.</p>
        </div>
      </div>

      <div class="prod">
        <div class="float f1"><s style="background:var(--green-soft);color:var(--green-2)"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 6 9 17l-5-5"/></svg></s><div>Identity match<small>98% &middot; verified</small></div></div>
        <div class="float f2"><s style="background:var(--blue-soft);color:var(--blue)"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M2 12h20"/></svg></s><div>Answer scored<small>82 / 100</small></div></div>
        <div class="prod-card">
          <div class="pc-bar">
            <span class="d" style="background:#ff5f57"></span><span class="d" style="background:#ffbd2e"></span><span class="d" style="background:#28c840"></span>
            <span class="pc-url">interviewer.ai / session</span>
            <span class="rec"><i></i>REC</span>
          </div>
          <div class="pc-body">
            <div class="pc-l">
              <span class="qtag">QUESTION 4 / 5</span>
              <div class="qbox"><p>How would you keep a service responsive when the database becomes the bottleneck?</p></div>
              <div class="ans" data-type></div>
              <div class="mt">
                <div class="m"><b>Technical depth <em>88</em></b><div class="bar"><i data-w="88"></i></div></div>
                <div class="m"><b>Communication <em>76</em></b><div class="bar"><i data-w="76"></i></div></div>
                <div class="m"><b>Confidence <em>81</em></b><div class="bar"><i data-w="81"></i></div></div>
              </div>
            </div>
            <div class="pc-r">
              <div class="cam">
                <div class="sil"></div><div class="scan"></div>
                <div class="brk"><i></i><i></i><i></i><i></i></div>
                <div class="tagm">IDENTITY LOCKED</div>
              </div>
              <div class="chk" data-chk>
                <div><s>&#10003;</s>Face detected</div>
                <div><s>&#10003;</s>Gaze on screen</div>
                <div><s>&#10003;</s>Alone in frame</div>
                <div><s>&#10003;</s>Screen shared</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="strip">
    <div class="shell">
      <p class="rv">Everything you need for a defensible assessment</p>
      <span class="rv"><s></s>Mock practice</span>
      <span class="rv" data-d="1"><s></s>Official proctoring</span>
      <span class="rv" data-d="2"><s></s>Identity verification</span>
      <span class="rv" data-d="3"><s></s>AI scoring</span>
      <span class="rv" data-d="4"><s></s>Admin console</span>
    </div>
  </div>
</section>

<section class="band">
  <div class="shell">
    <div class="sec-h center rv">
      <span class="eyebrow">How it works</span>
      <h2>Four gates. Watch each one run.</h2>
      <p class="lede" style="margin-inline:auto">Every gate has to pass before the next begins. Tap a step &mdash; the console on the right plays it back.</p>
    </div>
    <div class="work">
      <div class="wtabs rv" data-wtabs>
        <button class="wtab on" data-w="0"><span class="wn">1</span><div><h4>Devices checked</h4><p>Camera, mic and the entire screen are confirmed first.</p></div></button>
        <button class="wtab" data-w="1"><span class="wn">2</span><div><h4>Identity captured</h4><p>One photo becomes the baseline the session is measured against.</p></div></button>
        <button class="wtab" data-w="2"><span class="wn">3</span><div><h4>Interview watched</h4><p>Questions are asked and scored while proctoring runs live.</p></div></button>
        <button class="wtab" data-w="3"><span class="wn">4</span><div><h4>Report filed</h4><p>Scores, recording, snapshots and flags land together.</p></div></button>
      </div>
      <div class="wstage rv" data-d="1">
        <div class="wsbar"><i style="background:#ff5f57"></i><i style="background:#ffbd2e"></i><i style="background:#28c840"></i><span data-wslabel>device_check</span></div>
        <div class="wpanels" data-wpanels>
          <div class="wpanel on" data-p="0">
            <div class="wrow"><s>&#10003;</s>Camera <em>Granted</em></div>
            <div class="wrow"><s>&#10003;</s>Microphone <em>Granted</em></div>
            <div class="wrow"><s>&#10003;</s>Entire screen <em>Shared</em></div>
            <div class="wrow"><s style="background:color-mix(in srgb,var(--danger) 16%,transparent);color:var(--danger)">&#10007;</s>Single window <em class="bad">Rejected</em></div>
          </div>
          <div class="wpanel" data-p="1">
            <div class="wrow"><s>&#9673;</s>Face descriptor <em>128-d vector</em></div>
            <div class="wrow"><s>&#9673;</s>Baseline stored <em>00:00</em></div>
            <div class="wrow"><s>&#9673;</s>Match confidence <em>98%</em></div>
            <div class="wrow"><s>&#9673;</s>Re-checks every <em>30s</em></div>
          </div>
          <div class="wpanel" data-p="2">
            <div class="wrow"><s>&#10003;</s>Gaze on screen <em>OK</em></div>
            <div class="wrow"><s>&#10003;</s>Alone in frame <em>OK</em></div>
            <div class="wrow"><s style="background:color-mix(in srgb,var(--amber) 16%,transparent);color:var(--amber)">!</s>Phone in frame <em class="warn">Warn</em></div>
            <div class="wrow"><s>&#10003;</s>Answer scored <em>82 / 100</em></div>
          </div>
          <div class="wpanel" data-p="3">
            <div class="wrow"><s>&#10003;</s>Overall score <em>82 / 100</em></div>
            <div class="wrow"><s>&#10003;</s>Session recording <em>Stored</em></div>
            <div class="wrow"><s>&#10003;</s>Snapshots <em>8 archived</em></div>
            <div class="wrow"><s>&#10003;</s>Violation trail <em>Complete</em></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<section>
  <div class="shell">
    <div class="sec-h center rv">
      <span class="eyebrow">Live capabilities</span>
      <h2>Not a feature list &mdash; a system you can see working.</h2>
      <p class="lede" style="margin-inline:auto">Everything below is running as it would inside a real interview.</p>
    </div>
    <div class="bento2">
      <div class="cell big gr rv">
        <div class="ch"><span class="ci"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="9" r="3.2"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/></svg></span><h3>Identity verification</h3></div>
        <p class="cd">A baseline face is captured at the start, then re-scanned every 30 seconds. If the person changes, the interview ends at once.</p>
        <div class="viz"><div class="radar"><canvas data-radar></canvas><span class="mm" data-matchm>MATCH 98%</span></div></div>
      </div>

      <div class="cell wide rv" data-d="1">
        <div class="ch"><span class="ci"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s3.8-6.5 10-6.5S22 12 22 12s-3.8 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.8"/></svg></span><h3>Live proctoring</h3></div>
        <p class="cd">Gaze, second faces, phones and hands &mdash; checked continuously. The fourth violation ends the session.</p>
        <div class="viz">
          <div class="pchips" data-pchips>
            <span class="pchip"><s></s>Gaze</span><span class="pchip"><s></s>Faces</span><span class="pchip"><s></s>Phone</span><span class="pchip"><s></s>Hands</span>
          </div>
          <div class="strike"><span>Strikes</span><div class="pips" data-pips><i></i><i></i><i></i><i></i></div><em data-strikeout>TERMINATE</em></div>
        </div>
      </div>

      <div class="cell wide gr rv" data-d="2">
        <div class="ch"><span class="ci"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/><circle cx="12" cy="12" r="3.2"/></svg></span><h3>Instant AI scoring</h3></div>
        <p class="cd">Each answer is transcribed and scored against the rubric the moment the candidate stops speaking.</p>
        <div class="viz" style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
          <div class="ring">
            <svg width="120" height="120" viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" fill="none" stroke="var(--bg-soft2)" stroke-width="9"/><circle class="prog" data-ring cx="60" cy="60" r="52" fill="none" stroke="url(#lpRg)" stroke-width="9" stroke-linecap="round" stroke-dasharray="326.7" stroke-dashoffset="326.7" transform="rotate(-90 60 60)"/><defs><linearGradient id="lpRg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--blue)"/><stop offset="1" stop-color="var(--green)"/></linearGradient></defs></svg>
            <div class="rv-num" data-ringnum>0</div>
          </div>
          <div class="rbars" style="flex:1;min-width:130px">
            <div class="rbar"><b>Technical <em>88</em></b><div class="t"><i data-w="88"></i></div></div>
            <div class="rbar"><b>Communication <em>76</em></b><div class="t"><i data-w="76"></i></div></div>
            <div class="rbar"><b>Confidence <em>81</em></b><div class="t"><i data-w="81"></i></div></div>
          </div>
        </div>
      </div>

      <div class="cell rv">
        <div class="ch"><span class="ci"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2.5" y="4.5" width="19" height="13" rx="2.2"/><path d="M8 21h8M12 17.5V21"/></svg></span><h3>Entire-screen only</h3></div>
        <p class="cd">Won't start until the whole screen is shared.</p>
        <div class="viz"><div class="mon"><div class="ok"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6 9 17l-5-5"/></svg></div><span class="lbl">FULL SCREEN SHARED</span></div></div>
      </div>

      <div class="cell rv" data-d="1">
        <div class="ch"><span class="ci"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5l3.2 1.9"/></svg></span><h3>Full recordings</h3></div>
        <p class="cd">Webcam, screen and every flag, filed per day.</p>
        <div class="viz"><div class="film"><div class="film-t"><span class="frm"></span><span class="frm"></span><span class="frm"></span><span class="frm"></span><span class="frm"></span><span class="frm"></span><span class="frm"></span><span class="frm"></span><span class="frm"></span><span class="frm"></span></div></div></div>
      </div>

      <div class="cell gr rv" data-d="2">
        <div class="ch"><span class="ci"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19V10M10 19V5M16 19v-6M22 19H2"/></svg></span><h3>Admin console</h3></div>
        <p class="cd">Every event, logged and searchable.</p>
        <div class="viz"><div class="alog" data-alog></div></div>
      </div>
    </div>

    <div class="stats" style="margin-top:34px">
      <div class="sc rv"><b data-t="30">0</b><span>Proctoring checks per second</span></div>
      <div class="sc rv" data-d="1"><b data-t="4">0</b><span>Violations before termination</span></div>
      <div class="sc rv" data-d="2"><b data-t="30" data-suf="s">0</b><span>Between identity re-checks</span></div>
      <div class="sc rv" data-d="3"><b data-t="100" data-suf="%">0</b><span>Sessions kept for review</span></div>
    </div>
  </div>
</section>

<section style="padding-top:0">
  <div class="shell">
    <div class="cta rv">
      <h2>Run your next round with the lights on.</h2>
      <p>Set up a mock interview in minutes, or take a full cohort through a verified, proctored official round.</p>
      <div class="row">
        <a data-route="/register" class="btn btn-w btn-lg">Get started free</a>
        <a data-route="/contact" class="btn btn-o btn-lg">Talk to the team</a>
      </div>
    </div>
  </div>
</section>
`;
