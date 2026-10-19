/**
 * @file App.jsx
 * @description المكون الجذر للتطبيق
 *
 * لماذا هذا الملف:
 * - يستدعي AppRoutes.
 * - يعرض ToastContainer (حاوية الإشعارات).
 * - لا يحتوي على منطق (كل شيء في Routes).
 */

import AppRoutes from './routes/AppRoutes.jsx';
import ToastContainer from './components/UI/ToastContainer.jsx';

/**
 * المكون الجذر
 * @returns {JSX.Element}
 */
function App() {
  return (
    <>
      {/* ✅ المسارات */}
      <AppRoutes />

      {/* ✅ حاوية الإشعارات (ثابتة في الزاوية) */}
      <ToastContainer />
    </>
  );
}

export default App;