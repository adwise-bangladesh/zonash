import { Link } from "@tanstack/react-router";
import { useSession, useRoles, isStaff } from "@/lib/auth-helpers";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ShoppingBag, LayoutDashboard, LogOut } from "lucide-react";

export function AppHeader() {
  const { user } = useSession();
  const { data: roles } = useRoles();
  const staff = isStaff(roles);

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
        <Link to="/" className="flex items-center gap-2 font-display text-lg font-semibold">
          <ShoppingBag className="h-5 w-5 text-primary" />
          Shopdesk
        </Link>
        <nav className="hidden gap-5 text-sm text-muted-foreground md:flex">
          <Link to="/" className="hover:text-foreground [&.active]:text-foreground">
            Home
          </Link>
          <Link to="/products" className="hover:text-foreground [&.active]:text-foreground">
            Shop
          </Link>
          {user && (
            <Link to="/account/orders" className="hover:text-foreground [&.active]:text-foreground">
              My orders
            </Link>
          )}
          {staff && (
            <Link to="/admin" className="hover:text-foreground [&.active]:text-foreground">
              Dashboard
            </Link>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {staff && (
            <Link to="/admin">
              <Button variant="outline" size="sm" className="gap-2">
                <LayoutDashboard className="h-4 w-4" /> Admin
              </Button>
            </Link>
          )}
          {user ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.href = "/";
              }}
              className="gap-2"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          ) : (
            <Link to="/auth">
              <Button size="sm">Sign in</Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
