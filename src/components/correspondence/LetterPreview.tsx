import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { sanitizeHtml } from '@/lib/sanitize';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import abLogo from '@/assets/ab-insurance-logo.png';

interface CompanyInfo {
  company_name?: string;
  company_phone_links?: Array<{ phone: string; label?: string; link_type?: string }>;
  company_location?: string;
}

interface LetterPreviewProps {
  title: string;
  recipientName: string;
  bodyHtml: string;
  createdAt?: string;
  className?: string;
}

export function LetterPreview({ title, recipientName, bodyHtml, createdAt, className }: LetterPreviewProps) {
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCompanyInfo() {
      try {
        const { data, error } = await supabase
          .from('sms_settings')
          .select('company_phone_links, company_location')
          .limit(1)
          .single();
        
        if (error) throw error;
        
        let phoneLinks = data?.company_phone_links;
        if (phoneLinks && typeof phoneLinks === 'string') {
          try {
            phoneLinks = JSON.parse(phoneLinks);
          } catch {
            phoneLinks = [];
          }
        }
        
        setCompanyInfo({
          company_name: 'AB تأمين',
          company_phone_links: phoneLinks as CompanyInfo['company_phone_links'],
          company_location: data?.company_location || undefined,
        });
      } catch (error) {
        console.error('Error fetching company info:', error);
        setCompanyInfo({
          company_name: 'AB تأمين',
        });
      } finally {
        setLoading(false);
      }
    }
    fetchCompanyInfo();
  }, []);

  if (loading) {
    return (
      <div className={className}>
        <Skeleton className="h-32 w-full mb-4" />
        <Skeleton className="h-40 w-full mb-4" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  const phoneLinks = Array.isArray(companyInfo?.company_phone_links) 
    ? companyInfo.company_phone_links 
    : [];

  const formattedDate = createdAt 
    ? format(new Date(createdAt), 'dd/MM/yyyy')
    : format(new Date(), 'dd/MM/yyyy');

  return (
    <div 
      className={className}
      style={{ 
        direction: 'rtl',
        fontFamily: 'Arial, Tahoma, sans-serif',
        maxWidth: '800px',
        margin: '0 auto',
        backgroundColor: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        overflow: 'hidden',
      }}
    >
      {/* Professional Header */}
      <div style={{ 
        background: 'linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)',
        padding: '24px 40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <img 
            src={abLogo} 
            alt="AB تأمين"
            style={{ height: '70px', width: 'auto', borderRadius: '12px' }}
          />
          <div style={{ color: 'white' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0 }}>AB تأمين</h1>
            <p style={{ fontSize: '14px', margin: '4px 0 0', opacity: 0.9 }}>وكالة تأمين معتمدة</p>
          </div>
        </div>
        <div style={{ 
          textAlign: 'left', 
          color: 'white',
          fontSize: '13px',
          lineHeight: '1.6',
        }}>
          {phoneLinks.map((p, i) => (
            <div key={i}>
              {p.label ? `${p.label}: ` : ''}{p.phone}
            </div>
          ))}
          {companyInfo?.company_location && (
            <div style={{ opacity: 0.9 }}>{companyInfo.company_location}</div>
          )}
        </div>
      </div>

      {/* Letter Title */}
      <div style={{ 
        textAlign: 'center', 
        padding: '24px 40px 16px',
        borderBottom: '2px solid #0d9488',
        margin: '0 40px',
      }}>
        <h2 style={{ 
          fontSize: '22px', 
          fontWeight: 'bold', 
          color: '#0d9488',
          margin: 0,
        }}>
          {title || 'رسالة رسمية'}
        </h2>
      </div>

      {/* Letter Meta Info */}
      <div style={{ 
        padding: '24px 40px',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '16px',
        backgroundColor: '#f8fafc',
        margin: '0',
      }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <span style={{ color: '#64748b', fontWeight: '600' }}>التاريخ:</span>
          <span style={{ color: '#1e293b' }}>{formattedDate}</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <span style={{ color: '#64748b', fontWeight: '600' }}>من:</span>
          <span style={{ color: '#1e293b' }}>AB تأمين</span>
        </div>
        <div style={{ display: 'flex', gap: '8px', gridColumn: 'span 2' }}>
          <span style={{ color: '#64748b', fontWeight: '600' }}>إلى:</span>
          <span style={{ color: '#1e293b', fontWeight: '600' }}>{recipientName || '---'}</span>
        </div>
      </div>

      {/* Decorative Line */}
      <div style={{ 
        height: '4px', 
        background: 'linear-gradient(90deg, #0d9488 0%, #14b8a6 50%, #0d9488 100%)',
      }} />

      {/* Body Content */}
      <div style={{ padding: '32px 40px', minHeight: '250px' }}>
        <div style={{ 
          fontSize: '14px',
          lineHeight: '2.2',
          color: '#1e293b',
        }}>
          {/* Greeting */}
          <p style={{ marginBottom: '16px', fontWeight: '600' }}>
            {recipientName ? `حضرة السيد/ة ${recipientName} المحترم/ة،` : 'تحية طيبة وبعد،'}
          </p>
          
          {/* Main Content */}
          <div 
            style={{ whiteSpace: 'pre-wrap' }}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(bodyHtml) }}
          />
          
          {/* Closing */}
          <div style={{ marginTop: '32px' }}>
            <p style={{ marginBottom: '8px' }}>وتفضلوا بقبول فائق الاحترام والتقدير،</p>
          </div>
        </div>
      </div>

      {/* Signature Area */}
      <div style={{ 
        padding: '24px 40px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ 
            width: '150px', 
            borderTop: '2px solid #cbd5e1', 
            paddingTop: '8px',
            color: '#64748b',
            fontSize: '13px',
          }}>
            التوقيع والختم
          </div>
        </div>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '12px',
          opacity: 0.7,
        }}>
          <img 
            src={abLogo} 
            alt="AB تأمين"
            style={{ height: '40px', width: 'auto', borderRadius: '8px' }}
          />
          <span style={{ fontSize: '14px', color: '#64748b', fontWeight: '600' }}>
            AB تأمين
          </span>
        </div>
      </div>

      {/* Professional Footer */}
      <div style={{ 
        background: '#1e293b',
        padding: '16px 40px',
        textAlign: 'center',
        color: 'white',
        fontSize: '12px',
      }}>
        <div style={{ marginBottom: '4px', fontWeight: '600' }}>
          AB تأمين - وكالة تأمين معتمدة
        </div>
        <div style={{ opacity: 0.7 }}>
          {phoneLinks.map((p, i) => (
            <span key={i}>
              {i > 0 && ' | '}
              {p.label ? `${p.label}: ` : ''}{p.phone}
            </span>
          ))}
          {companyInfo?.company_location && (
            <span> | {companyInfo.company_location}</span>
          )}
        </div>
      </div>
    </div>
  );
}
