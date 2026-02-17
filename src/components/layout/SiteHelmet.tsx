import { Helmet } from "react-helmet-async";
import { useSiteSettings } from "@/hooks/useSiteSettings";

export function SiteHelmet() {
  const { data: settings } = useSiteSettings();

  if (!settings) return null;

  return (
    <Helmet>
      <title>{settings.site_title}</title>
      <meta name="description" content={settings.site_description} />
      <meta property="og:title" content={settings.site_title} />
      <meta property="og:description" content={settings.site_description} />
      <meta name="twitter:title" content={settings.site_title} />
      <meta name="twitter:description" content={settings.site_description} />
      {settings.og_image_url && (
        <>
          <meta property="og:image" content={settings.og_image_url} />
          <meta name="twitter:image" content={settings.og_image_url} />
        </>
      )}
      {settings.favicon_url && (
        <link rel="icon" href={settings.favicon_url} />
      )}
    </Helmet>
  );
}
