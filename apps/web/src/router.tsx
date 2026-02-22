import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { RootLayout } from "@/components/layout/root-layout";
import { LoginPage } from "@/pages/login";
import { RegisterPage } from "@/pages/register";
import { DashboardPage } from "@/pages/dashboard";
import { StudentsPage } from "@/pages/students";
import { StudentNewPage } from "@/pages/student-new";
import { StudentEditPage } from "@/pages/student-edit";
import { StudentDocumentsPage } from "@/pages/student-documents";
import { DocumentViewPage } from "@/pages/document-view";
import { LatexDocumentsPage } from "@/pages/latex-documents";
import { LatexDocumentViewPage } from "@/pages/latex-document-view";
import { SettingsPage } from "@/pages/settings";
import { PromptsPage } from "@/pages/prompts";
import { PrivacyPage } from "@/pages/privacy";
import { AllDocumentsPage } from "@/pages/all-documents";
import { NotFoundPage } from "@/pages/not-found";
import { ForgotPasswordPage } from "@/pages/forgot-password";
import { ResetPasswordPage } from "@/pages/reset-password";

function GuestRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function AppRouter() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <GuestRoute>
            <LoginPage />
          </GuestRoute>
        }
      />
      <Route
        path="/register"
        element={
          <GuestRoute>
            <RegisterPage />
          </GuestRoute>
        }
      />
      <Route
        path="/esqueci-minha-senha"
        element={
          <GuestRoute>
            <ForgotPasswordPage />
          </GuestRoute>
        }
      />
      <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
      <Route
        element={
          <ProtectedRoute>
            <RootLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="documentos" element={<AllDocumentsPage />} />
        <Route path="alunos" element={<StudentsPage />} />
        <Route path="alunos/novo" element={<StudentNewPage />} />
        <Route path="alunos/:id/editar" element={<StudentEditPage />} />
        <Route path="alunos/:id/documentos" element={<StudentDocumentsPage />} />
        <Route path="alunos/:id/documentos/:docId" element={<DocumentViewPage />} />
        <Route path="alunos/:id/documentos-latex" element={<LatexDocumentsPage />} />
        <Route path="alunos/:id/documentos-latex/:docId" element={<LatexDocumentViewPage />} />
        <Route path="prompts" element={<PromptsPage />} />
        <Route path="configuracoes" element={<SettingsPage />} />
      </Route>
      <Route path="privacidade" element={<PrivacyPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
