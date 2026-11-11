import { createBrowserRouter, RouterProvider } from 'react-router';
import { Layout } from '@/components/Layout';
import { RouteCrashPage } from '@/pages/ErrorPage';
import Home from '@/pages/Home';
import NotFound from '@/pages/NotFound';

// Every route here needs an entry in src/shared/seo.ts too - tests/routes.test.ts checks.
const router = createBrowserRouter([
  {
    element: <Layout />,
    // The layout itself failing: nothing of it can be trusted to render, so the crash page stands alone.
    errorElement: <RouteCrashPage standalone />,
    children: [
      {
        // Pathless, so a page's error renders inside the layout and the header and footer stay.
        errorElement: <RouteCrashPage />,
        children: [
          { index: true, element: <Home /> },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
