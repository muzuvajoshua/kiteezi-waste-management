import Link from "next/link"
import { usePathname } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { MapPin, Trash, Coins, Medal, Settings, Home, ListChecks, ClipboardCheck } from "lucide-react"

// /report and /my-reports exist as of KWM-025/KWM-027, /supervisor/inbox as of
// KWM-032. The remaining entries still 404 — they are the original C-10
// finding and are tracked by their own issues (KWM-030 /collect, KWM-033
// /rewards, and the leaderboard/settings pages). Left in place rather than
// removed so the intended shape of the app stays visible; each disappears
// from this list as its page lands.
//
// The review queue is listed for everyone, which is wrong but not unsafe: the
// page's own action refuses anyone without a supervisor or admin role, so a
// citizen following the link is told they lack permission rather than shown
// the queue. Hiding it needs the sidebar to know the session's roles, and this
// is a server-rendered list inside a client component with no session access —
// a real change, not a one-liner, so it is deliberately not smuggled in here.
const sidebarItems = [
  { href: "/", icon: Home, label: "Home" },
  { href: "/report", icon: MapPin, label: "Report Waste" },
  { href: "/my-reports", icon: ListChecks, label: "My Reports" },
  { href: "/supervisor/inbox", icon: ClipboardCheck, label: "Review Queue" },
  { href: "/collect", icon: Trash, label: "Collect Waste" },
  { href: "/rewards", icon: Coins, label: "Rewards" },
  { href: "/leaderboard", icon: Medal, label: "Leaderboard" },
]

interface SidebarProps {
  open: boolean
}

export default function Sidebar({ open }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside className={`bg-white border-r pt-20 border-gray-200 text-gray-800 w-64 fixed inset-y-0 left-0 z-30 transform transition-transform duration-300 ease-in-out ${open ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
      <nav className="h-full flex flex-col justify-between">
        <div className="px-4 py-6 space-y-8">
          {sidebarItems.map((item) => (
            <Link key={item.href} href={item.href} passHref>
              <Button 
                variant={pathname === item.href ? "secondary" : "ghost"}
                className={`w-full justify-start py-3 ${
                  pathname === item.href 
                    ? "bg-green-100 text-green-800" 
                    : "text-gray-600 hover:bg-gray-100"
                }`} 
              >
                <item.icon className="mr-3 h-5 w-5" />
                <span className="text-base">{item.label}</span>
              </Button>
            </Link>
          ))}
        </div>
        <div className="p-4 border-t border-gray-200">
          <Link href="/settings" passHref>
            <Button 
              variant={pathname === "/settings" ? "secondary" : "outline"}
              className={`w-full py-3 ${
                pathname === "/settings"
                  ? "bg-green-100 text-green-800"
                  : "text-gray-600 border-gray-300 hover:bg-gray-100"
              }`} 
            >
              <Settings className="mr-3 h-5 w-5" />
              <span className="text-base">Settings</span>
            </Button>
          </Link>
        </div>
      </nav>
    </aside>
  )
}