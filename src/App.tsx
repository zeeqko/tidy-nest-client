import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { HomePage } from "./components/HomePage";
import { AllItemsPage } from "./components/AllItemsPage";
import { AllCategoriesPage } from "./components/AllCategoriesPage";
import { CategoryPage } from "./components/CategoryPage";
import { SignInPage } from "./components/SignInPage";
import { SignUpPage } from "./components/SignUpPage";
import { RequireAuth } from "./components/RequireAuth";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/signin" element={<SignInPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/items" element={<AllItemsPage />} />
            <Route path="/categories" element={<AllCategoriesPage />} />
            <Route path="/category/:categoryId" element={<CategoryPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
