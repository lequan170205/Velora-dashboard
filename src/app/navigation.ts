import {
  Activity,
  Bell,
  BrainCircuit,
  Film,
  Gauge,
  KeyRound,
  MessageSquare,
  Phone,
  ScrollText,
  Server,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  to: string;
  label: string;
  title: string;
  icon: LucideIcon;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Infrastructure",
    items: [
      {
        to: "/server",
        label: "Server",
        title: "Server resources",
        icon: Server,
      },
    ],
  },
  {
    label: "Services",
    items: [
      {
        to: "/service",
        label: "Monitoring",
        title: "Monitoring service",
        icon: Activity,
      },
      {
        to: "/conversation",
        label: "Conversation",
        title: "Conversation service",
        icon: MessageSquare,
      },
      {
        to: "/call-service",
        label: "Call service",
        title: "Call service",
        icon: Phone,
      },
      {
        to: "/notification-service",
        label: "Notifications",
        title: "Notification service",
        icon: Bell,
      },
      {
        to: "/auth-service",
        label: "Auth",
        title: "Auth service",
        icon: KeyRound,
      },
      {
        to: "/user-service",
        label: "Users",
        title: "User service",
        icon: Users,
      },
      {
        to: "/rag",
        label: "RAG",
        title: "RAG monitoring",
        icon: BrainCircuit,
      },
      {
        to: "/reels",
        label: "Reels",
        title: "Reel pipeline",
        icon: Film,
      },
    ],
  },
  {
    label: "Observability",
    items: [
      { to: "/alerts", label: "Alerts", title: "Active alerts", icon: Bell },
      { to: "/logs", label: "Logs", title: "Service logs", icon: ScrollText },
    ],
  },
  {
    label: "Calls",
    items: [
      {
        to: "/calls",
        label: "Overview",
        title: "Calls",
        icon: Gauge,
      },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

export const titleForPath = (pathname: string): string => {
  if (pathname === "/timeline") return "Call timeline";
  return NAV_ITEMS.find((item) => item.to === pathname)?.title ?? "Velora Operations";
};
