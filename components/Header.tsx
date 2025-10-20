"use client";
import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import Link from "next/link";

import {
  Bell,
  Leaf,
  Menu,
  LogIn,
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

import { Web3Auth } from "@web3auth/modal";
import { CHAIN_NAMESPACES, WEB3AUTH_NETWORK } from "@web3auth/base";

import { EthereumPrivateKeyProvider } from "@web3auth/ethereum-provider";
import {
  createUser,
  getUserByEmail,
  getUnreadNotifications,
  getUserBalance,
  markNotificationAsRead,
} from "@/utils/db/actions";
import { useMediaQuery } from "@/hooks/useMediaQuery";

// Custom notification type to avoid conflict with browser's Notification API
interface NotificationItem {
  id: number;
  userId: number;
  type: string;
  createdAt: Date;
  message: string;
  isRead: boolean;
}

interface UserInfo {
  email?: string;
  name?: string;
  profileImage?: string;
  aggregateVerifier?: string;
  verifier?: string;
  verifierId?: string;
  typeOfLogin?: string;
}

const clientId = process.env.NEXT_PUBLIC_WEB3_AUTH_CLIENT_ID || "";

const chainConfig = {
  chainNamespace: CHAIN_NAMESPACES.EIP155,
  chainId: "0xaa36a7",
  rpcTarget: process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.ankr.com/eth_sepolia",
  displayName: "Sepolia Testnet",
  blockExplorerURL: "https://sepolia.etherscan.io",
  ticker: "ETH",
  tickerName: "Ethereum",
  logo: "https://assets.web3auth.io/evm-chains/sepolia.png",
};

const privateKeyProvider = new EthereumPrivateKeyProvider({
  config: { chainConfig },
});

const web3Auth = new Web3Auth({
  clientId,
  web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET,
  privateKeyProvider,
});

interface HeaderProps {
  onMenuClick: () => void;
  totalEarnings?: number;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isWeb3AuthReady, setIsWeb3AuthReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [userInfor, setUserInfor] = useState<UserInfo | null>(null);
  const [notification, setNotification] = useState<NotificationItem[]>([]);
  const [balance, setBalance] = useState(0);
  const isMobile = useMediaQuery("(max-width: 768px)");
  useEffect(() => {
    const init = async () => {
      try {
        await web3Auth.initModal();
        setIsWeb3AuthReady(true);

        if (web3Auth.connected) {
          setLoggedIn(true);
          const user = await web3Auth.getUserInfo();
          setUserInfor(user);

          if (user.email) {
            localStorage.setItem("email", user.email);
            try {
              await createUser(user.email, user.name || "Anonymous User");
            } catch (error) {
              console.error("Error creating User", error);
            }
          }
        }
      } catch (error) {
        console.error("Error initialising Web3Auth", error);
        setInitError(
          "Failed to initialize Web3Auth. Please ensure your domain is whitelisted in the Web3Auth dashboard."
        );
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  useEffect(() => {
    const fetchNotifications = async () => {
      if (userInfor && userInfor.email) {
        const user = await getUserByEmail(userInfor.email);
        if (user) {
          const unReadNotifications = await getUnreadNotifications(user.id);
          setNotification(unReadNotifications);
        }
      }
    };
    fetchNotifications();

    const notificationInterval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(notificationInterval);
  }, [userInfor]);

  useEffect(() => {
    const fetchUserBalance = async () => {
      if (userInfor && userInfor.email) {
        const user = await getUserByEmail(userInfor.email);
        if (user) {
          const userBalance = await getUserBalance(user.id);
          setBalance(userBalance);
        }
      }
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
  }, [userInfor]);

  const login = async () => {
    if (!web3Auth) {
      console.error("Web3Auth not initialised");
      return;
    }
    if (!isWeb3AuthReady) {
      console.error("Web3Auth modal not ready yet. Please wait for initialization to complete.");
      return;
    }
    try {
      await web3Auth.connect();
      setLoggedIn(true);

      const user = await web3Auth.getUserInfo();
      setUserInfor(user);

      if (user.email) {
        localStorage.setItem("email", user.email);
        try {
          await createUser(user.email, user.name || "Anonymous User");
        } catch (error) {
          console.error("Error creating User", error);
        }
      }
    } catch (error) {
      console.error("Error logging in", error);
    }
  };

  const logout = async () => {
    if (!web3Auth) {
      console.error("Web3Auth not initialised");
      return;
    }
    try {
      await web3Auth.logout();
      setLoggedIn(false);
      setUserInfor(null);
      localStorage.removeItem("email");
    } catch (error) {
      console.error("Error logging out", error);
    }
  };

  const getUserInfor = async () => {
    if (web3Auth.connected) {
      const user = await web3Auth.getUserInfo();
      setUserInfor(user);

      if (user.email) {
        localStorage.setItem("email", user.email);
        try {
          await createUser(user.email, user.name || "Anonymous User");
        } catch (error) {
          console.error("Error creating User", error);
        }
      }
    }
  };

  const handleNotificationClick = async (notificationId: number) => {
    await markNotificationAsRead(notificationId);
  };

  if (loading) {
    return <div>Loading web3Auth ........</div>;
  }

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
            <Button
              onClick={login}
              disabled={!isWeb3AuthReady}
              className="bg-green-600 hover:bg-green-700 text-white text-sm md:text-base disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isWeb3AuthReady ? "Login" : "Initializing..."}
              <LogIn className="ml-1 md:ml-2 h-4 w-4 md:h-5 md:w-5" />
            </Button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="flex items-center">
                  <User className="h-5 w-5 mr-1" />
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={getUserInfor}>
                  {userInfor ? userInfor.name : "Fetch User Info"}
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Link href="/settings">Profile</Link>
                </DropdownMenuItem>
                <DropdownMenuItem>Settings</DropdownMenuItem>
                <DropdownMenuItem onClick={logout}>Sign Out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </header>
  )
}
