import {
  ArrowUpCircleIcon,
  BarChartIcon,
  CameraIcon,
  ChartAreaIcon,
  ClipboardListIcon,
  DatabaseIcon,
  FileCodeIcon,
  FileIcon,
  FileTextIcon,
  HelpCircleIcon,
  LayoutDashboardIcon,
  Shield,
  SettingsIcon,
  TrendingUpIcon,
  X,
  Bot,
  Edit3,
} from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '~/lib/components/ui/sidebar'
import { Button } from '~/lib/components/ui/button'
import { NavDocuments } from '~/lib/components/ui/nav-documents'
import { NavMain } from '~/lib/components/ui/nav-main'
import { NavSecondary } from '~/lib/components/ui/nav-secondary'
import { NavUser } from '~/lib/components/ui/nav-user'
import { isCurrentUserModeratorFn } from '~/lib/server/isCurrentUserModerator'

interface NavigationItem {
  href: string
  label: string
}

interface AppSidebarProps {
  variant?: 'inset' | 'sidebar' | 'floating'
  navigationItems?: NavigationItem[]
  user?: any
}

const data = {
  user: {
    name: 'shadcn',
    email: 'm@example.com',
    avatar: '/avatars/shadcn.jpg',
  },
  navMain: [
    {
      title: 'Home',
      url: '/home',
      icon: LayoutDashboardIcon,
    },
    {
      title: 'Live Exchange',
      url: '/live-exchange',
      icon: TrendingUpIcon,
    },
    {
      title: 'Setup',
      url: '/setup',
      icon: Shield,
    },
    {
      title: 'Bot Studio',
      url: '/bot-studio',
      icon: Bot,
    },
    {
      title: 'Strategy Editor',
      url: '/strategy-editor',
      icon: Edit3,
    },
  ],
  navClouds: [
    {
      title: 'Capture',
      icon: CameraIcon,
      isActive: true,
      url: '#',
      items: [
        {
          title: 'Active Proposals',
          url: '#',
        },
        {
          title: 'Archived',
          url: '#',
        },
      ],
    },
    {
      title: 'Proposal',
      icon: FileTextIcon,
      url: '#',
      items: [
        {
          title: 'Active Proposals',
          url: '#',
        },
        {
          title: 'Archived',
          url: '#',
        },
      ],
    },
    {
      title: 'Prompts',
      icon: FileCodeIcon,
      url: '#',
      items: [
        {
          title: 'Active Proposals',
          url: '#',
        },
        {
          title: 'Archived',
          url: '#',
        },
      ],
    },
  ],
  navSecondary: [
    {
      title: 'Settings',
      url: '/settings',
      icon: SettingsIcon,
    },
    {
      title: 'Get Help',
      url: 'https://www.hilfe-info.de/Webs/hilfeinfo/EN/HelpAndAdvice/Psychological_support/PsychologischeUnterstuetzung_node.html',
      icon: HelpCircleIcon,
    },
    /*
    {
      title: 'Search',
      url: '#',
      icon: SearchIcon,
    },*/
  ],

  // documents: [
  //   {
  //     name: 'Data Library',
  //     url: '#',
  //     icon: DatabaseIcon,
  //   },
  //   {
  //     name: 'Reports',
  //     url: '#',
  //     icon: ClipboardListIcon,
  //   },
  //   {
  //     name: 'Word Assistant',
  //     url: '#',
  //     icon: FileIcon,
  //   },
  // ],
}

export function AppSidebar({ variant = 'inset', user }: AppSidebarProps) {
  const { isMobile, setOpenMobile } = useSidebar()

  const { data: isModeratorFromRpc, error: isModeratorError } = useQuery({
    queryKey: ['current-user-moderator'],
    queryFn: () => isCurrentUserModeratorFn(),
    staleTime: 1000 * 60,
    retry: 1,
  })

  useEffect(() => {
    if (isModeratorError) {
      console.warn('Unable to determine moderator status:', isModeratorError)
    }
  }, [isModeratorError])

  const canViewSetup = isModeratorFromRpc ?? user?.exchange_role === 'moderator'

  // Filter navigation items based on the exchange role that syncs with public.privileges
  const filteredNavMain = data.navMain.filter(item => {
    if (item.title === 'Setup') {
      return Boolean(canViewSetup)
    }
    return true
  })

  return (
    <Sidebar variant={variant}>
      <SidebarHeader>
        <div className="flex items-center justify-between">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:!p-1.5">
                <Link to="/home">
                  <span className="text-base font-semibold">Bot Trading Simulator</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          {isMobile && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setOpenMobile(false)}
            >
              <X className="size-4" />
              <span className="sr-only">Close sidebar</span>
            </Button>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={filteredNavMain} />
        {/* <NavDocuments items={data.documents} /> */}
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  )
}
