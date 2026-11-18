import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AccountProvider } from './context/AccountContext';
import { ThemeProvider } from './context/ThemeContext';
import { AboutSafetyPage } from './pages/AboutSafetyPage';
import { AccountPage } from './pages/AccountPage';
import { AdminPage } from './pages/AdminPage';
import { ClaimFormPage } from './pages/ClaimFormPage';
import { HomePage } from './pages/HomePage';
import { ItemDetailsPage } from './pages/ItemDetailsPage';
import { MyNoticesPage } from './pages/MyNoticesPage';
import { ReportItemPage } from './pages/ReportItemPage';
import { SummaryPage } from './pages/SummaryPage';
import { TrackClaimPage } from './pages/TrackClaimPage';

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AccountProvider>
          <Layout>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/report" element={<ReportItemPage />} />
              <Route path="/item/:id" element={<ItemDetailsPage />} />
              <Route path="/item/:id/claim" element={<ClaimFormPage />} />
              <Route path="/my-notices" element={<MyNoticesPage />} />
              <Route path="/track-claim" element={<TrackClaimPage />} />
              <Route path="/summary" element={<SummaryPage />} />
              <Route path="/account" element={<AccountPage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/about" element={<AboutSafetyPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        </AccountProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
