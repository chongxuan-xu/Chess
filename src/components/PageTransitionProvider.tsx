"use client";

import React, { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { PageLoader } from "./PageLoader";

interface PageTransitionProviderProps {
  children: React.ReactNode;
}

export function PageTransitionProvider({ children }: PageTransitionProviderProps) {
  const [isPending, setIsPending] = useState(false);
  const pathname = usePathname();
  const activePathRef = useRef(pathname);

  // Keep path ref updated
  useEffect(() => {
    activePathRef.current = pathname;
  }, [pathname]);

  const startPathRef = useRef<string | null>(null);
  const targetPathRef = useRef<string | null>(null);

  // Constantly check if the page is ready (completed its mount and internal loading screen)
  useEffect(() => {
    if (!isPending) return;

    let isDestroyed = false;
    let intervalId: NodeJS.Timeout;

    // Failsafe timer (maximum duration 8 seconds so screen doesn't get stuck in catastrophic network loss)
    const failsafeTimer = setTimeout(() => {
      if (!isDestroyed) {
        setIsPending(false);
      }
    }, 8000);

    const checkPageReady = () => {
      if (isDestroyed) return;

      const currentPath = window.location.pathname;
      const startPath = startPathRef.current;
      const targetPath = targetPathRef.current;

      const isSamePath = (a: string, b: string) => {
        const clean = (p: string) => p.replace(/\/$/, "");
        return clean(a) === clean(b);
      };

      // Check if we have moved away from our starting path
      let hasProgressed = false;
      if (startPath && targetPath) {
        if (!isSamePath(startPath, targetPath)) {
          if (isSamePath(currentPath, startPath) || isSamePath(pathname, startPath)) {
            return;
          }
          hasProgressed = true;
        } else {
          hasProgressed = true;
        }
      } else if (startPath) {
        if (pathname !== startPath || currentPath !== startPath) {
          hasProgressed = true;
        }
      } else {
        hasProgressed = true;
      }

      // Check if there are any page-level PageLoader elements active in the child rendering tree
      const pageLoaders = document.querySelectorAll('[data-page-loader="true"]:not([data-overlay-loader="true"])');
      
      // Ensure current router pathname is in sync with actual window location path (verifies route transition is complete)
      const isPathSynchronized = pathname === window.location.pathname;

      if (hasProgressed && pageLoaders.length === 0 && isPathSynchronized) {
        setIsPending(false);
      }
    };

    // Run first check immediately
    checkPageReady();

    // Constant high-frequency check to detect page readiness instantly
    intervalId = setInterval(checkPageReady, 50);

    const handlePageReadyEvent = () => {
      if (!isDestroyed) {
        setIsPending(false);
      }
    };

    window.addEventListener("gml_page_ready", handlePageReadyEvent);

    return () => {
      isDestroyed = true;
      clearInterval(intervalId);
      clearTimeout(failsafeTimer);
      window.removeEventListener("gml_page_ready", handlePageReadyEvent);
    };
  }, [isPending, pathname]);

  useEffect(() => {
    // Priority loader trigger - updates matching states safely
    const triggerPendingState = (targetUrl?: string, isProgrammatic = false) => {
      if (typeof window !== "undefined") {
        startPathRef.current = window.location.pathname;
        if (targetUrl) {
          try {
            const tempUrl = new URL(targetUrl, window.location.origin);
            targetPathRef.current = tempUrl.pathname;
          } catch {
            targetPathRef.current = null;
          }
        } else {
          targetPathRef.current = null;
        }
      }

      if (isProgrammatic) {
        // Run in next tick to avoid React render phase scheduling / useInsertionEffect conflicts during router transition
        setTimeout(() => {
          setIsPending(true);
        }, 0);
      } else {
        setIsPending(true);
      }
    };

    // 1. Intercept all internal document click events on actual anchor links
    const handleGlobalClick = (e: MouseEvent) => {
      let target = e.target as HTMLElement | null;
      while (target && target.tagName !== "A") {
        target = target.parentElement;
      }
      
      if (target && target.tagName === "A") {
        const href = target.getAttribute("href");
        if (href) {
          const isInternal = href.startsWith("/") && !href.startsWith("//") && !href.includes(":");
          const isAnchor = href.startsWith("#") || href.includes("#");
          const isFile = href.match(/\.(png|jpg|jpeg|gif|svg|pdf|zip|txt)$/i);
          
          if (isInternal && !isAnchor && !isFile) {
            // Check modifier keys to let new tabs open peacefully without showing loader
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) {
              return;
            }

            // Normalise paths to verify if we are actually changing paths
            try {
              const tempUrl = new URL(href, window.location.origin);
              const isSamePage = tempUrl.pathname === window.location.pathname;
              
              if (!isSamePage) {
                triggerPendingState(href, false);
              }
            } catch {
              // Fallback
              triggerPendingState(href, false);
            }
          }
        }
      }
    };

    // 2. Intercept programmatic history methods (pushState / replaceState) to catch router.push
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    window.history.pushState = function (state, title, url) {
      if (url) {
        const urlStr = typeof url === "string" ? url : url.toString();
        try {
          const tempUrl = new URL(urlStr, window.location.origin);
          const isSamePage = tempUrl.pathname === window.location.pathname;
          const isFile = urlStr.match(/\.(png|jpg|jpeg|gif|svg|pdf|zip|txt)$/i);
          
          if (urlStr.startsWith("/") && !isSamePage && !isFile) {
            triggerPendingState(urlStr, true);
          }
        } catch {
          // Fallback
          triggerPendingState(urlStr, true);
        }
      }
      return originalPushState.apply(this, [state, title, url]);
    };

    window.history.replaceState = function (state, title, url) {
      if (url) {
        const urlStr = typeof url === "string" ? url : url.toString();
        try {
          const tempUrl = new URL(urlStr, window.location.origin);
          const isSamePage = tempUrl.pathname === window.location.pathname;
          const isFile = urlStr.match(/\.(png|jpg|jpeg|gif|svg|pdf|zip|txt)$/i);
          
          if (urlStr.startsWith("/") && !isSamePage && !isFile) {
            triggerPendingState(urlStr, true);
          }
        } catch {
          // Fallback
          triggerPendingState(urlStr, true);
        }
      }
      return originalReplaceState.apply(this, [state, title, url]);
    };

    document.addEventListener("click", handleGlobalClick);

    return () => {
      document.removeEventListener("click", handleGlobalClick);
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
    };
  }, []);

  return (
    <>
      {isPending && (
        <div id="gml-route-overlay" className="absolute inset-0 z-[10000] bg-slate-950/90 backdrop-blur-sm pointer-events-auto select-none flex flex-col items-center justify-center animate-in fade-in duration-200">
          <PageLoader 
            data-overlay-loader="true"
            message="Switching Chamber..." 
            submessage="Preparing real-time database feeds and re-orienting tactical overlay matrices."
          />
        </div>
      )}
      {children}
    </>
  );
}
