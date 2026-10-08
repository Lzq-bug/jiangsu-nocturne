import { useEffect } from 'react';
import { Link, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useGame } from '@/game/store';
import { audio } from '@/audio/AudioService';
import { EnvironmentScene, type SceneKey } from '@/ui/EnvironmentScene';
import HomePage from '@/pages/HomePage';
import StarCatchPage from '@/pages/StarCatchPage';
import UnsealPage from '@/pages/UnsealPage';
import CollectionPage from '@/pages/CollectionPage';
import CardDetailPage from '@/pages/CardDetailPage';
import GalleryPage from '@/pages/GalleryPage';
import SettingsPage from '@/pages/SettingsPage';
import AboutPage from '@/pages/AboutPage';

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);
  return null;
}

/** 路由 → 环境场景（统一背景系统 + 轻微场景差异） */
function sceneFor(pathname: string): SceneKey {
  if (pathname === '/') return 'home';
  if (pathname.startsWith('/starcatch')) return 'observatory';
  if (pathname.startsWith('/unseal')) return 'unseal';
  if (pathname.startsWith('/collection')) return 'archive';
  if (pathname.startsWith('/gallery')) return 'archive';
  if (pathname.startsWith('/card/')) return 'detail';
  return 'quiet';
}

function Shell() {
  const stardust = useGame((s) => s.stardust);
  const init = useGame((s) => s.init);
  const ready = useGame((s) => s.ready);
  const settings = useGame((s) => s.settings);
  const { pathname } = useLocation();
  const scene = sceneFor(pathname);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    audio.setVolumes({
      master: settings.master, bgm: settings.bgm, sfx: settings.sfx, muted: settings.muted,
    });
  }, [settings]);

  // 首个用户手势解锁音频 + 开场氛围音
  useEffect(() => {
    const unlock = () => {
      audio.unlock();
      audio.startAmbient();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  return (
    <>
      <EnvironmentScene scene={scene} />
      <div className="shell">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand" aria-label="夜泊江苏 · 回到主厅">
            <b>夜泊江苏</b>
            <span>JIANGSU NOCTURNE</span>
          </Link>
          <nav className="nav" aria-label="主导航">
            <NavLink to="/" end>主厅</NavLink>
            <NavLink to="/starcatch">观星台</NavLink>
            <NavLink to="/unseal">启封</NavLink>
            <NavLink to="/collection">夜泊阁</NavLink>
            <NavLink to="/gallery">画廊</NavLink>
            <NavLink to="/settings">设置</NavLink>
          </nav>
          <span className="stardust-chip" title="星屑 · 启封仪式的燃料" aria-live="polite">
            ✦ {ready ? stardust : '—'}
          </span>
        </div>
      </header>

      <ScrollTop />
      <main className="page fade-in">
        <Outlet />
      </main>

      <footer className="footer">
        夜泊江苏 · Jiangsu Nocturne — 七十八帧水韵江苏的夜色收藏
        {' · '}
        <Link to="/about" style={{ color: 'inherit' }}>关于本项目</Link>
      </footer>
      </div>
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<HomePage />} />
        <Route path="/starcatch" element={<StarCatchPage />} />
        <Route path="/unseal" element={<UnsealPage />} />
        <Route path="/collection" element={<CollectionPage />} />
        <Route path="/card/:id" element={<CardDetailPage />} />
        <Route path="/gallery" element={<GalleryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="*" element={<HomePage />} />
      </Route>
    </Routes>
  );
}
