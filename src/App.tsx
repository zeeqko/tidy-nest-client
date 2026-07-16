import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HomePage } from "./components/HomePage";
import { AllItemsPage } from "./components/AllItemsPage";
import { AllCategoriesPage } from "./components/AllCategoriesPage";
import { CategoryPage } from "./components/CategoryPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/items" element={<AllItemsPage />} />
        <Route path="/categories" element={<AllCategoriesPage />} />
        <Route path="/category/:categoryId" element={<CategoryPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
