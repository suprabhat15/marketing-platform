"use client";

import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LoginButton } from "@/components/auth/login-button";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: "📊", path: "/" },
    { id: "campaigns", label: "Campaigns", icon: "📧", path: "/campaigns" },
    { id: "subscribers", label: "Subscribers", icon: "👥", path: "/subscribers" },
    { id: "templates", label: "Templates", icon: "📝", path: "/templates" },
    { id: "analytics", label: "Analytics", icon: "📈", path: "/analytics" },
    { id: "automation", label: "Automation", icon: "⚙️", path: "/automation" },
    { id: "lists", label: "Lists", icon: "📋", path: "/lists" },
  ];

  const handleNavigation = (path: string) => {
    router.push(path);
  };

  return (
    <div className="w-64 h-screen bg-sidebar border-r border-sidebar-border p-4 flex flex-col">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-sidebar-foreground">MailPackr</h1>
        <ThemeToggle />
      </div>
      
      <nav className="space-y-2 flex-1">
        {menuItems.map((item) => (
          <Button
            key={item.id}
            variant={pathname === item.path ? "default" : "ghost"}
            className="w-full justify-start text-left"
            onClick={() => handleNavigation(item.path)}
          >
            <span className="mr-3">{item.icon}</span>
            {item.label}
          </Button>
        ))}
      </nav>
      
      <div className="mt-auto pt-4 border-t border-sidebar-border">
        <LoginButton />
      </div>
    </div>
  );
}