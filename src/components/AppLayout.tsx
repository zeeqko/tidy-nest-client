import { useEffect, useState } from "react";
import { Outlet, useLocation, useParams } from "react-router-dom";
import { HomeTopBar } from "./HomeTopBar";
import { NavMenu } from "./NavMenu";
import { BottomNav } from "./BottomNav";
import { ItemFormModal } from "./ItemFormModal";
import { ManageCategoriesModal } from "./ManageCategoriesModal";
import { useCategories } from "../hooks/useCategories";

/** Fetches categories only while the layout-level add-item modal is open.
 *  Route-aware: on `/category/:categoryId` it preselects that category, the
 *  same way `CategoryPage`'s own (now-removed) header add button used to —
 *  this is the single add-item entry point on mobile category pages. */
function LayoutItemForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { apiCategories } = useCategories();
  const { categoryId } = useParams<{ categoryId?: string }>();
  const initialCategoryId = categoryId ? Number(categoryId) : undefined;
  return (
    <ItemFormModal
      apiCategories={apiCategories}
      initialCategoryId={initialCategoryId}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

/**
 * Shared shell: top bar + nav menu on every page, plus a mobile bottom nav.
 * Global modals live here; when one closes after changes, the routed page is
 * remounted (via key) so its data hooks refetch.
 */
export function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [pageVersion, setPageVersion] = useState(0);
  const { pathname } = useLocation();

  const reloadPage = () => setPageVersion((v) => v + 1);
  // Sub-pages render their own back-button top bar on mobile (per UI.pen);
  // the brand bar stays on Home and on desktop.
  const isHome = pathname === "/";

  // The mobile bottom nav's Category tab opens Edit Categories as a tab-like
  // panel (see ManageCategoriesModal's belowBottomNav/hideMobileBackButton),
  // not a stacked flow with its own back button — so navigating to another
  // tab is what closes it, same as switching any other tab.
  useEffect(() => setManageOpen(false), [pathname]);

  return (
    <div className="min-h-screen w-full bg-cute-bg pt-[env(safe-area-inset-top)] pb-24 sm:pb-0">
      <HomeTopBar
        className={isHome ? "flex" : "hidden sm:flex"}
        onMenuClick={() => setMenuOpen((open) => !open)}
        menuOpen={menuOpen}
      />
      <NavMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onManageCategories={() => setManageOpen(true)}
      />
      <Outlet key={pageVersion} />
      <BottomNav
        onAddItem={() => setAddItemOpen(true)}
        onEditCategory={() => setManageOpen((open) => !open)}
        editCategoryActive={manageOpen}
        onTabChange={() => setManageOpen(false)}
      />
      {manageOpen && (
        <ManageCategoriesModal
          onClose={(changes) => {
            setManageOpen(false);
            if (changes.categories || changes.items) reloadPage();
          }}
        />
      )}
      {addItemOpen && (
        <LayoutItemForm onClose={() => setAddItemOpen(false)} onSaved={reloadPage} />
      )}
    </div>
  );
}
