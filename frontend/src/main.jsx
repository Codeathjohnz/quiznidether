import { createRoot } from 'react-dom/client';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import '@fontsource/luckiest-guy';
import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import './index.css';
import { ToastProvider } from './components/ui';
import AdminLayout from './components/AdminLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Classes from './pages/Classes';
import Quizzes from './pages/Quizzes';
import QuizForm from './pages/QuizForm';
import Questions from './pages/Questions';
import Results from './pages/Results';
import AttemptDetail from './pages/AttemptDetail';
import Account from './pages/Account';
import TakeQuiz from './pages/TakeQuiz';
import Feedback from './pages/Feedback';
import Developer from './pages/Developer';
createRoot(document.getElementById('root')).render(
  <ToastProvider>
    <HashRouter>
      <Routes>
        <Route path="/take/:code" element={<TakeQuiz />} />
        <Route path="/login" element={<Login />} />
        <Route element={<AdminLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="classes" element={<Classes />} />
          <Route path="quizzes" element={<Quizzes />} />
          <Route path="quizzes/new" element={<QuizForm />} />
          <Route path="quizzes/:id/edit" element={<QuizForm />} />
          <Route path="quizzes/:id/questions" element={<Questions />} />
          <Route path="results" element={<Results />} />
          <Route path="attempts/:id" element={<AttemptDetail />} />
          <Route path="account" element={<Account />} />
          <Route path="feedback" element={<Feedback />} />
          <Route path="developer" element={<Developer />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  </ToastProvider>
);
