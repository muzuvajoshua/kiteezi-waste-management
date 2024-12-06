"use client";

import { useState, useEffect } from "react";
import { Toaster } from "react-hot-toast";
import { Button } from "./ui/button";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Bell,
  Leaf,
  Menu,
  LogIn,
  LogOut,
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
import { CHAIN_NAMESPACES, IProvider, WEB3AUTH_NETWORK } from "@web3auth/base";

import { EthereumPrivateKeyProvider } from "@web3auth/ethereum-provider";
import { createUser, getUserByEmail } from "@/utils/db/actions";

const ClientId = process.env.WEB3AUTH_CLIENT_ID;

const chainConfig = {
  chainNamespace: CHAIN_NAMESPACES.EIP155,
  chainIs: "0xaa36a7",
  rpcTarget: "https://rpc.ankr.com/eth_sepolia",
  displayName: "Sepolia Testnet",
  blockExplorerURL: "https://sepolia.etherscan.io",
  ticker: "ETH",
  tickerName: "Ethereum",
  logo: "https://assets.web3auth.io/evm-chains/sepolia.png",
};

const privateKeyProvider = new EthereumPrivateKeyProvider({
  config: chainConfig,
});

const web3Auth = new Web3Auth({
  ClientId,
  web3AuthNetwork: WEB3AUTH_NETWORK.TESTNET,
  privateKeyProvider,
});

interface HeaderProps {
  onMenuClick: () => void;
  totalEarnings: number;
}

export default function Header({ onMenuClick, totalEarnings }: HeaderProps) {
  const [provider, setProvider] = useState<IProvider | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userInfor, setUserInfor] = useState<any>(null);
  const pathname = usePathname();
  const [notification, setNotification] = useState<Notification[]>([]);
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    const init = async () => {
      try {
        setProvider(web3Auth.provider);
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
      }
    };
  });
}
