"use client";
import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import Link from "next/link";

import {
  Bell,
  Leaf,
  Menu,
  Search,
  Coins,
  User,
  ChevronDown,
} from "lucide-react";

import {
  DropdownMenuItem,
  DropdownMenuContent,
  DropdownMenu,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

import { Badge } from "./ui/badge";

import {
  getUnreadNotifications,
  markNotificationAsRead,
} from "@/modules/notifications/presentation/notification.actions";
import { getUserBalance } from "@/modules/rewards/presentation/reward.actions";
import toast from "react-hot-toast";
import { actionErrorMessage } from "@/lib/action-error";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useGoogleAuth } from "@/components/GoogleAuthProvider";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

// Custom notification type to avoid conflict with browser's Notification API
interface NotificationItem {
  id: number;
  userId: number;
  type: string;
  createdAt: Date;
  message: string;
  isRead: boolean;
}

interface HeaderProps {
  onMenuClick: () => void;
  totalEarnings?: number;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const { user, logout } = useGoogleAuth();
  // One source of identity: GoogleAuthProvider resolves it from the server
  // session (/api/auth/me) and keeps it current through sign-in and logout,
  // so there is no second useSession() call to drift from it.
  const sessionUser = user;
  const [notification, setNotification] = useState<NotificationItem[]>([]);
  const [balance, setBalance] = useState(0);
  const isMobile = useMediaQuery("(max-width: 768px)");

  const loggedIn = !!user;

  useEffect(() => {
    const fetchNotifications = async () => {
      if (!sessionUser) return;
      const result = await getUnreadNotifications();
      // Background poll: on failure keep whatever we last knew rather than
      // clearing the badge. Before KWM-019 this action returned `[]` on error,
      // indistinguishable from "no notifications", so a transient fault
      // silently told the user their inbox was empty. No toast either — this
      // runs every 30s unattended, and a toast loop is worse than silence.
      if (!result.ok) {
        console.error("Could not load notifications:", result.error.code);
        return;
      }
      setNotification(result.value);
    };
    fetchNotifications();

    const notificationInterval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(notificationInterval);
  }, [sessionUser]);

  useEffect(() => {
    const fetchUserBalance = async () => {
      if (!sessionUser) return;
      const result = await getUserBalance();
      // Same reasoning as the notification poll: a failed read must not render
      // as a balance of 0, which is what the old `return 0` fallback did.
      if (!result.ok) {
        console.error("Could not load reward balance:", result.error.code);
        return;
      }
      setBalance(result.value);
    };
    fetchUserBalance();

    const handleBalanceUpdate = (event: CustomEvent) => {
      setBalance(event.detail);
    };
    window.addEventListener(
      "balanceUpdate",
      handleBalanceUpdate as EventListener
    );
    return () => {
      window.removeEventListener(
        "balanceUpdate",
        handleBalanceUpdate as EventListener
      );
    };
  }, [sessionUser]);

  const handleNotificationClick = async (notificationId: number) => {
    const result = await markNotificationAsRead(notificationId);
    // User-initiated, so a failure gets a toast (KWM-019 AC3). This is the case
    // that used to throw: Next.js redacts thrown Server Action errors in
    // production, so "Not the resource owner" reached the client as an opaque
    // digest and nothing could be shown at all.
    if (!result.ok) {
      toast.error(actionErrorMessage(result.error));
      return;
    }
    setNotification((current) => current.filter((n) => n.id !== notificationId));
  };

   return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center">
          <Button variant="ghost" size="icon" className="mr-2 md:mr-4" onClick={onMenuClick}>
            <Menu className="h-6 w-6" />
          </Button>
          <Link href="/" className="flex items-center">
            <Leaf className="h-6 w-6 md:h-8 md:w-8 text-green-500 mr-1 md:mr-2" />
            <div className="flex flex-col">
              <span className="font-bold text-base md:text-lg text-gray-800">Kiteezi Waste Management System</span>
              <span className="text-[8px] md:text-[10px] text-gray-500 -mt-1">ETHOnline24</span>
            </div>
          </Link>
        </div>
        {!isMobile && (
          <div className="flex-1 max-w-xl mx-4">
            <div className="relative">
              <input
                type="text"
                placeholder="Search..."
                className="w-full px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            </div>
          </div>
        )}
        <div className="flex items-center">
          {isMobile && (
            <Button variant="ghost" size="icon" className="mr-2">
              <Search className="h-5 w-5" />
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="mr-2 relative">
                <Bell className="h-5 w-5" />
                {notification.length > 0 && (
                  <Badge className="absolute -top-1 -right-1 px-1 min-w-[1.2rem] h-5">
                    {notification.length}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              {notification.length > 0 ? (
                notification.map((notif) => (
                  <DropdownMenuItem
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif.id)}
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{notif.type}</span>
                      <span className="text-sm text-gray-500">{notif.message}</span>
                    </div>
                  </DropdownMenuItem>
                ))
              ) : (
                <DropdownMenuItem>No new notifications</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="mr-2 md:mr-4 flex items-center bg-gray-100 rounded-full px-2 md:px-3 py-1">
            <Coins className="h-4 w-4 md:h-5 md:w-5 mr-1 text-green-500" />
            <span className="font-semibold text-sm md:text-base text-gray-800">
              {balance.toFixed(2)}
            </span>
          </div>
          {!loggedIn ? (
            // Google inline for one-click, plus a link to /sign-in for the
            // email/password form — that flow needs more room than the header
            // has, and a password field in a header invites mis-typing.
            <div className="flex items-center gap-2">
              <GoogleSignInButton />
              <Link
                href="/sign-in"
                className="whitespace-nowrap text-sm font-medium text-green-700 underline hover:text-green-800"
              >
                Use email
              </Link>
            </div>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="flex items-center">
                  <User className="h-5 w-5 mr-1" />
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>
                  {user?.name ?? "User"}
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Link href="/settings">Profile</Link>
                </DropdownMenuItem>
                <DropdownMenuItem>Settings</DropdownMenuItem>
                <DropdownMenuItem onClick={() => void logout()}>Sign Out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </header>
  )
}
