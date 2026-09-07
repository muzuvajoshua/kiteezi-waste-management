"use client";
import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import Link from "next/link";

import { Bell, ChevronDown, Coins, Leaf, Menu, User } from "lucide-react";

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
    <header className="sticky top-0 z-50 border-b border-white/10 bg-ink-900">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Toggle navigation"
            className="text-cream-300 hover:bg-white/10 hover:text-white lg:hidden"
            onClick={onMenuClick}
          >
            <Menu className="h-6 w-6" />
          </Button>
          <Link href="/" className="flex items-center gap-2.5">
            <Leaf className="h-7 w-7 text-brand-300" />
            {/*
              The subtitle here used to read "ETHOnline24" — a hackathon
              leftover from before Web3Auth was removed, so the app announced a
              stack it had not run on for months. The search box beside it was
              decorative: an input wired to nothing, which is worse than no
              search because it invites the attempt. Both gone.
            */}
            <span className="font-display text-lg font-bold tracking-tight text-white">
              Kiteezi
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Notifications"
                className="relative text-cream-300 hover:bg-white/10 hover:text-white"
              >
                <Bell className="h-5 w-5" />
                {notification.length > 0 && (
                  <Badge className="absolute -right-1 -top-1 h-5 min-w-[1.2rem] bg-accent-500 px-1 text-white hover:bg-accent-500">
                    {notification.length}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              {notification.length > 0 ? (
                notification.map((notif) => (
                  <DropdownMenuItem
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif.id)}
                  >
                    <div className="flex flex-col">
                      <span className="font-medium capitalize">
                        {notif.type.replace(/_/g, " ")}
                      </span>
                      <span className="text-sm text-muted-foreground">{notif.message}</span>
                    </div>
                  </DropdownMenuItem>
                ))
              ) : (
                <DropdownMenuItem disabled>No new notifications</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5">
            <Coins className="h-4 w-4 text-accent-500" />
            <span className="font-display text-sm font-bold text-white">
              {balance.toFixed(0)}
            </span>
          </span>

          {!loggedIn ? (
            // Google inline for one-click, plus a link to the landing page's
            // sign-in card for the email/password form — that flow needs more
            // room than a header has, and a password field in a header invites
            // mis-typing.
            <div className="flex items-center gap-2">
              <GoogleSignInButton />
              <Link
                href="/#sign-in"
                className="whitespace-nowrap text-sm font-medium text-accent-500 hover:text-accent-400"
              >
                Use email
              </Link>
            </div>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Account"
                  className="flex items-center text-cream-300 hover:bg-white/10 hover:text-white"
                >
                  <User className="mr-1 h-5 w-5" />
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem disabled className="font-medium">
                  {user?.name ?? "User"}
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/my-reports">My reports</Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void logout()}>Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </header>
  )
}
