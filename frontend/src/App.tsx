import { Navigate, Route, Routes } from 'react-router-dom';
import { LoaderCircle } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { CatalogPage } from '@/pages/catalog-page';
import { LoginPage } from '@/pages/login-page';

export default function App() {
  const { session, isRestoring } = useAuth();

  if (isRestoring) {
    return (
      <main className="grid min-h-screen place-items-center bg-background">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin text-primary" />
          Restoring your demo session…
        </div>
      </main>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={session ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route
        path="/"
        element={session ? <CatalogPage /> : <Navigate to="/login" replace />}
      />
      <Route path="*" element={<Navigate to={session ? '/' : '/login'} replace />} />
    </Routes>
  );
}
