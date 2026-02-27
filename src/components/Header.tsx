import { DiscoBallIcon } from '@phosphor-icons/react';
import { Link, useMatches } from '@tanstack/react-router';

import {
    Breadcrumb,
    // BreadcrumbEllipsis,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator
} from '@/components/ui/breadcrumb';

export default function Header() {
    const matches = useMatches();
    const params: any = matches[matches.length - 1]?.params || {};
    const { pid, sid } = params;

    return (
        <header className="flex items-center gap-2 bg-gray-800 p-4 text-white shadow-lg">
            <span>
                <DiscoBallIcon size={32} />
            </span>
            <h1 className="text-xl font-semibold">
                <Link to="/">GemmaShop</Link>
            </h1>
            <Breadcrumb className="ml-14">
                <BreadcrumbList>
                    <BreadcrumbItem>
                        <BreadcrumbLink asChild>
                            <Link to="/">Home</Link>
                        </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    {/*
          <BreadcrumbItem>
            <BreadcrumbEllipsis />
          </BreadcrumbItem>
          <BreadcrumbSeparator />
           */}
                    <BreadcrumbItem>
                        <BreadcrumbLink asChild>
                            <Link to="/project">Projects</Link>
                        </BreadcrumbLink>
                    </BreadcrumbItem>
                    {pid && (
                        <>
                            <BreadcrumbSeparator />
                            <BreadcrumbItem>{pid}</BreadcrumbItem>
                            <BreadcrumbSeparator />
                            <BreadcrumbItem>
                                <BreadcrumbLink asChild>
                                    <Link
                                        to="/project/$pid/stage"
                                        params={{
                                            pid
                                        }}
                                    >
                                        Stages
                                    </Link>
                                </BreadcrumbLink>
                            </BreadcrumbItem>
                            {sid && (
                                <>
                                    <BreadcrumbSeparator />
                                    <BreadcrumbItem>
                                        <BreadcrumbPage>{sid}</BreadcrumbPage>
                                    </BreadcrumbItem>
                                </>
                            )}
                        </>
                    )}
                </BreadcrumbList>
            </Breadcrumb>
        </header>
    );
}
