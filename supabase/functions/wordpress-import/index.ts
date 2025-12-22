import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ImportStats {
  insuranceCompanies: { inserted: number; updated: number; errors: string[] };
  pricingRules: { inserted: number; updated: number; errors: string[] };
  brokers: { inserted: number; updated: number; errors: string[] };
  clients: { inserted: number; updated: number; errors: string[] };
  cars: { inserted: number; updated: number; errors: string[] };
  policies: { inserted: number; updated: number; errors: string[] };
  payments: { inserted: number; updated: number; errors: string[] };
  outsideCheques: { inserted: number; updated: number; errors: string[] };
  invoices: { inserted: number; updated: number; errors: string[] };
  mediaFiles: { inserted: number; updated: number; errors: string[] };
  carAccidents: { inserted: number; updated: number; errors: string[] };
}

// Date conversion: d-m-Y to YYYY-MM-DD
function convertDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  // Check if already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  // Convert d-m-Y to YYYY-MM-DD
  const match = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return null;
}

// Policy type parent mapping
function mapPolicyTypeParent(wpType: string | null | undefined): string | null {
  if (!wpType) return null;
  const mapping: Record<string, string> = {
    'ELZAMI': 'ELZAMI',
    'THIRD_FULL': 'THIRD_FULL',
    'ROAD_SERVICE': 'ROAD_SERVICE',
    'ACCIDENT_FEE_EXEMPTION': 'ACCIDENT_FEE_EXEMPTION',
    'HEALTH': 'HEALTH',
    'LIFE': 'LIFE',
    'PROPERTY': 'PROPERTY',
    'TRAVEL': 'TRAVEL',
    'BUSINESS': 'BUSINESS',
    'OTHER': 'OTHER',
  };
  return mapping[wpType.toUpperCase()] || null;
}

// Policy type child mapping
function mapPolicyTypeChild(wpType: string | null | undefined): string | null {
  if (!wpType) return null;
  const mapping: Record<string, string> = {
    'THIRD': 'THIRD',
    'FULL': 'FULL',
  };
  return mapping[wpType.toUpperCase()] || null;
}

// Car type mapping from Arabic to enum
function mapCarType(wpType: string | null | undefined): string {
  if (!wpType) return 'car';
  const mapping: Record<string, string> = {
    'car': 'car',
    'cargo': 'cargo',
    'small': 'small',
    'taxi': 'taxi',
    'tjeradown4': 'tjeradown4',
    'tjeraup4': 'tjeraup4',
    'سيارة': 'car',
    'شاحنة': 'cargo',
    'صغيرة': 'small',
    'تكسي': 'taxi',
    'تجارية تحت 4 طن': 'tjeradown4',
    'تجارية فوق 4 طن': 'tjeraup4',
  };
  return mapping[wpType.toLowerCase()] || 'car';
}

// Payment type mapping
function mapPaymentType(wpType: string | null | undefined): string {
  if (!wpType) return 'cash';
  const mapping: Record<string, string> = {
    'cash': 'cash',
    'كاش': 'cash',
    'cheque': 'cheque',
    'check': 'cheque',
    'شيك': 'cheque',
    'visa': 'visa',
    'فيزا': 'visa',
    'transfer': 'transfer',
    'حوالة': 'transfer',
    'bank_transfer': 'transfer',
  };
  return mapping[wpType.toLowerCase()] || 'cash';
}

// Rule type mapping
function mapRuleType(wpType: string | null | undefined): string | null {
  if (!wpType) return null;
  const mapping: Record<string, string> = {
    'THIRD_PRICE': 'THIRD_PRICE',
    'FULL_PERCENT': 'FULL_PERCENT',
    'MIN_PRICE': 'MIN_PRICE',
    'DISCOUNT': 'DISCOUNT',
    'ROAD_SERVICE_BASE': 'ROAD_SERVICE_BASE',
    'ROAD_SERVICE_PRICE': 'ROAD_SERVICE_PRICE',
    'ROAD_SERVICE_EXTRA_OLD_CAR': 'ROAD_SERVICE_EXTRA_OLD_CAR',
  };
  return mapping[wpType.toUpperCase()] || null;
}

// Age band mapping
function mapAgeBand(wpBand: string | null | undefined): string {
  if (!wpBand) return 'ANY';
  const mapping: Record<string, string> = {
    'UNDER_24': 'UNDER_24',
    'under_24': 'UNDER_24',
    'UP_24': 'UP_24',
    'up_24': 'UP_24',
    'OVER_24': 'UP_24',
    'ANY': 'ANY',
  };
  return mapping[wpBand] || 'ANY';
}

// Extract unique companies from policies
function extractCompaniesFromPolicies(policies: any[]): any[] {
  const companiesMap = new Map<string, any>();
  
  for (const policy of policies || []) {
    if (policy.company_details && policy.company_name) {
      const companyName = policy.company_name.toLowerCase();
      if (!companiesMap.has(companyName)) {
        companiesMap.set(companyName, {
          name: policy.company_name,
          legacy_wp_id: policy.company_legacy_id,
          category_parent: mapCategoryFromParentTerm(policy.company_details.parent_term_name),
          details: policy.company_details,
        });
      }
    }
  }
  
  return Array.from(companiesMap.values());
}

// Map parent term name to category
function mapCategoryFromParentTerm(termName: string | null | undefined): string | null {
  if (!termName) return null;
  const mapping: Record<string, string> = {
    'الزامي': 'ELZAMI',
    'ثالث/شامل': 'THIRD_FULL',
    'خدمات الطريق': 'ROAD_SERVICE',
    'اعفاء رسوم حادث': 'ACCIDENT_FEE_EXEMPTION',
  };
  return mapping[termName] || null;
}

// Extract unique cars from policies
function extractCarsFromPolicies(policies: any[]): any[] {
  const carsMap = new Map<string, any>();
  
  for (const policy of policies || []) {
    if (policy.car_details && policy.car_number) {
      const carNumber = policy.car_number;
      if (!carsMap.has(carNumber)) {
        carsMap.set(carNumber, {
          ...policy.car_details,
          car_number: carNumber,
          client_id_number: policy.client_details?.id_number,
        });
      }
    }
  }
  
  return Array.from(carsMap.values());
}

// Extract unique clients from both clients array and policies
function extractClientsFromData(data: any): any[] {
  const clientsMap = new Map<string, any>();
  
  // First, add clients from the clients array
  for (const client of data.clients || []) {
    if (client.id_number) {
      clientsMap.set(client.id_number, client);
    }
  }
  
  // Then, add any missing clients from policies
  for (const policy of data.policies || []) {
    if (policy.client_details && policy.client_details.id_number) {
      const idNumber = policy.client_details.id_number;
      if (!clientsMap.has(idNumber)) {
        clientsMap.set(idNumber, policy.client_details);
      }
    }
  }
  
  return Array.from(clientsMap.values());
}

// Count all data for preview
function countData(data: any) {
  // Extract unique entities from policies
  const policies = data.policies || [];
  
  // Extract companies from policies
  const companiesMap = new Map<string, any>();
  for (const policy of policies) {
    if (policy.company_name) {
      companiesMap.set(policy.company_name.toLowerCase(), policy.company_details);
    }
  }
  
  // Extract cars from policies
  const carsMap = new Map<string, any>();
  for (const policy of policies) {
    if (policy.car_number) {
      carsMap.set(policy.car_number, policy.car_details);
    }
  }
  
  // Count payments from policies
  let paymentsCount = 0;
  let mediaCount = 0;
  let accidentsCount = 0;
  
  for (const policy of policies) {
    paymentsCount += (policy.payments || []).length;
    mediaCount += (policy.images || []).length;
    
    if (policy.car_details?.accidents) {
      accidentsCount += policy.car_details.accidents.length;
    }
  }
  
  // Add media from cars
  for (const policy of policies) {
    if (policy.car_details?.images) {
      mediaCount += policy.car_details.images.length;
    }
  }
  
  return {
    insuranceCompanies: companiesMap.size,
    pricingRules: 0, // Will be computed from company details later
    brokers: (data.brokers || []).length,
    clients: (data.clients || []).length,
    cars: carsMap.size,
    policies: policies.length,
    payments: paymentsCount,
    outsideCheques: (data.outside_cheques || []).length,
    invoices: 0, // No separate invoices array
    mediaFiles: mediaCount,
    carAccidents: accidentsCount,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, data, clearBeforeImport } = await req.json();

    if (action === 'preview') {
      const counts = countData(data);
      return new Response(JSON.stringify({ success: true, counts }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'clear') {
      console.log('Clearing all data...');
      
      // Delete in correct order (respecting foreign keys)
      await supabase.from('invoices').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('policy_payments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('customer_signatures').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('car_accidents').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('media_files').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('policies').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('outside_cheques').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('cars').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('clients').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('brokers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      
      return new Response(JSON.stringify({ success: true, message: 'All data cleared' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'import') {
      const stats: ImportStats = {
        insuranceCompanies: { inserted: 0, updated: 0, errors: [] },
        pricingRules: { inserted: 0, updated: 0, errors: [] },
        brokers: { inserted: 0, updated: 0, errors: [] },
        clients: { inserted: 0, updated: 0, errors: [] },
        cars: { inserted: 0, updated: 0, errors: [] },
        policies: { inserted: 0, updated: 0, errors: [] },
        payments: { inserted: 0, updated: 0, errors: [] },
        outsideCheques: { inserted: 0, updated: 0, errors: [] },
        invoices: { inserted: 0, updated: 0, errors: [] },
        mediaFiles: { inserted: 0, updated: 0, errors: [] },
        carAccidents: { inserted: 0, updated: 0, errors: [] },
      };

      // Maps for tracking legacy IDs to new UUIDs
      const companyMap = new Map<string, string>(); // wp_name -> uuid
      const brokerMap = new Map<string, string>(); // wp_name -> uuid
      const clientMap = new Map<string, string>(); // wp_id_number -> uuid
      const carMap = new Map<string, string>(); // wp_car_number -> uuid
      const policyMap = new Map<number, string>(); // wp_id -> uuid

      // Clear data if requested
      if (clearBeforeImport) {
        console.log('Clearing data before import...');
        await supabase.from('invoices').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('policy_payments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('customer_signatures').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('car_accidents').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('media_files').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('policies').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('outside_cheques').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('cars').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('clients').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('brokers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      }

      // 1. Extract and Import Insurance Companies from policies
      console.log('Extracting and importing insurance companies...');
      const companies = extractCompaniesFromPolicies(data.policies || []);
      console.log(`Found ${companies.length} unique companies`);
      
      for (const company of companies) {
        try {
          const { data: existing } = await supabase
            .from('insurance_companies')
            .select('id')
            .ilike('name', company.name)
            .maybeSingle();

          const companyData = {
            name: company.name,
            name_ar: company.name,
            active: true,
            category_parent: company.category_parent,
          };

          if (existing) {
            await supabase
              .from('insurance_companies')
              .update(companyData)
              .eq('id', existing.id);
            companyMap.set(company.name.toLowerCase(), existing.id);
            stats.insuranceCompanies.updated++;
          } else {
            const { data: inserted, error } = await supabase
              .from('insurance_companies')
              .insert(companyData)
              .select('id')
              .single();
            if (inserted) {
              companyMap.set(company.name.toLowerCase(), inserted.id);
              stats.insuranceCompanies.inserted++;
            } else if (error) {
              stats.insuranceCompanies.errors.push(`Company ${company.name}: ${error.message}`);
            }
          }
        } catch (e: any) {
          stats.insuranceCompanies.errors.push(`Company ${company.name}: ${e.message}`);
        }
      }

      // 2. Import Brokers
      console.log('Importing brokers...');
      for (const broker of data.brokers || []) {
        try {
          const { data: existing } = await supabase
            .from('brokers')
            .select('id')
            .ilike('name', broker.name)
            .maybeSingle();

          const brokerData = {
            name: broker.name,
            phone: broker.phone || null,
            image_url: broker.image_url || null,
            notes: broker.notes || null,
          };

          if (existing) {
            await supabase
              .from('brokers')
              .update(brokerData)
              .eq('id', existing.id);
            brokerMap.set(broker.name.toLowerCase(), existing.id);
            stats.brokers.updated++;
          } else {
            const { data: inserted, error } = await supabase
              .from('brokers')
              .insert(brokerData)
              .select('id')
              .single();
            if (inserted) {
              brokerMap.set(broker.name.toLowerCase(), inserted.id);
              stats.brokers.inserted++;
            } else if (error) {
              stats.brokers.errors.push(`Broker ${broker.name}: ${error.message}`);
            }
          }
        } catch (e: any) {
          stats.brokers.errors.push(`Broker ${broker.name}: ${e.message}`);
        }
      }

      // 3. Import Clients
      console.log('Importing clients...');
      const clients = extractClientsFromData(data);
      console.log(`Found ${clients.length} unique clients`);
      
      for (const client of clients) {
        try {
          if (!client.id_number) {
            stats.clients.errors.push(`Client missing id_number: ${client.full_name}`);
            continue;
          }

          const { data: existing } = await supabase
            .from('clients')
            .select('id')
            .eq('id_number', client.id_number)
            .is('deleted_at', null)
            .maybeSingle();

          const brokerId = client.broker_name ? brokerMap.get(client.broker_name.toLowerCase()) : null;

          const clientData = {
            full_name: client.full_name || 'غير معروف',
            id_number: client.id_number,
            phone_number: client.phone_number || null,
            file_number: client.file_number || null,
            date_joined: convertDate(client.date_joined),
            image_url: client.image_url || null,
            signature_url: client.signature_url || null,
            notes: client.notes || null,
            less_than_24: client.less_than_24 === true,
            broker_id: brokerId,
          };

          if (existing) {
            await supabase
              .from('clients')
              .update(clientData)
              .eq('id', existing.id);
            clientMap.set(client.id_number, existing.id);
            stats.clients.updated++;
          } else {
            const { data: inserted, error } = await supabase
              .from('clients')
              .insert(clientData)
              .select('id')
              .single();
            if (inserted) {
              clientMap.set(client.id_number, inserted.id);
              stats.clients.inserted++;
            } else if (error) {
              stats.clients.errors.push(`Client ${client.id_number}: ${error.message}`);
            }
          }
        } catch (e: any) {
          stats.clients.errors.push(`Client ${client.id_number}: ${e.message}`);
        }
      }

      // 4. Extract and Import Cars from policies
      console.log('Extracting and importing cars...');
      const cars = extractCarsFromPolicies(data.policies || []);
      console.log(`Found ${cars.length} unique cars`);
      
      for (const car of cars) {
        try {
          const clientId = car.client_id_number ? clientMap.get(car.client_id_number) : null;
          if (!clientId) {
            stats.cars.errors.push(`Car ${car.car_number}: Client not found: ${car.client_id_number}`);
            continue;
          }

          const { data: existing } = await supabase
            .from('cars')
            .select('id')
            .eq('car_number', car.car_number)
            .is('deleted_at', null)
            .maybeSingle();

          const carData = {
            car_number: car.car_number,
            client_id: clientId,
            manufacturer_name: car.manufacturer_name || null,
            model: car.model || null,
            model_number: car.model_number || null,
            year: car.year ? parseInt(car.year) : null,
            color: car.color || null,
            car_value: car.car_value ? parseFloat(car.car_value) : null,
            car_type: mapCarType(car.car_type),
            license_type: car.license_type || null,
            last_license: convertDate(car.last_license),
            license_expiry: convertDate(car.license_finish),
          };

          if (existing) {
            await supabase
              .from('cars')
              .update(carData)
              .eq('id', existing.id);
            carMap.set(car.car_number, existing.id);
            stats.cars.updated++;
          } else {
            const { data: inserted, error } = await supabase
              .from('cars')
              .insert(carData)
              .select('id')
              .single();
            if (inserted) {
              carMap.set(car.car_number, inserted.id);
              stats.cars.inserted++;
            } else if (error) {
              stats.cars.errors.push(`Car ${car.car_number}: ${error.message}`);
            }
          }
        } catch (e: any) {
          stats.cars.errors.push(`Car ${car.car_number}: ${e.message}`);
        }
      }

      // 5. Import Policies
      console.log('Importing policies...');
      for (const policy of data.policies || []) {
        try {
          const clientIdNumber = policy.client_details?.id_number;
          if (!clientIdNumber) {
            stats.policies.errors.push(`Policy ${policy.legacy_wp_id}: No client id_number`);
            continue;
          }

          const clientId = clientMap.get(clientIdNumber);
          if (!clientId) {
            stats.policies.errors.push(`Policy ${policy.legacy_wp_id}: Client not found: ${clientIdNumber}`);
            continue;
          }

          const carId = policy.car_number ? carMap.get(policy.car_number) : null;
          const companyId = policy.company_name ? companyMap.get(policy.company_name.toLowerCase()) : null;
          const brokerId = policy.broker_name ? brokerMap.get(policy.broker_name.toLowerCase()) : null;

          const policyTypeParent = mapPolicyTypeParent(policy.policy_type_parent);
          if (!policyTypeParent) {
            stats.policies.errors.push(`Policy ${policy.legacy_wp_id}: Invalid policy type: ${policy.policy_type_parent}`);
            continue;
          }

          // Check if policy exists by legacy_wp_id
          const { data: existing } = await supabase
            .from('policies')
            .select('id')
            .eq('legacy_wp_id', policy.legacy_wp_id)
            .is('deleted_at', null)
            .maybeSingle();

          const policyData = {
            legacy_wp_id: policy.legacy_wp_id,
            policy_number: policy.policy_number_hint || null,
            client_id: clientId,
            car_id: carId,
            company_id: companyId,
            broker_id: brokerId,
            policy_type_parent: policyTypeParent,
            policy_type_child: mapPolicyTypeChild(policy.policy_type_child),
            start_date: convertDate(policy.start_date) || new Date().toISOString().split('T')[0],
            end_date: convertDate(policy.end_date) || new Date().toISOString().split('T')[0],
            insurance_price: parseFloat(policy.insurance_price) || 0,
            profit: parseFloat(policy.profit) || 0,
            payed_for_company: parseFloat(policy.payed_for_company) || 0,
            is_under_24: policy.is_under_24 === true,
            cancelled: policy.cancelled === true,
            transferred: policy.transferred === true,
            transferred_car_number: policy.transferred_car_number || null,
            notes: policy.notes || null,
            calc_status: policy.calc_status || 'pending',
          };

          if (existing) {
            await supabase
              .from('policies')
              .update(policyData)
              .eq('id', existing.id);
            policyMap.set(policy.legacy_wp_id, existing.id);
            stats.policies.updated++;
          } else {
            const { data: inserted, error } = await supabase
              .from('policies')
              .insert(policyData)
              .select('id')
              .single();
            if (inserted) {
              policyMap.set(policy.legacy_wp_id, inserted.id);
              stats.policies.inserted++;
            } else if (error) {
              stats.policies.errors.push(`Policy ${policy.legacy_wp_id}: ${error.message}`);
            }
          }

          // Import policy payments
          const policyId = policyMap.get(policy.legacy_wp_id);
          if (policyId && policy.payments && Array.isArray(policy.payments)) {
            for (const payment of policy.payments) {
              try {
                const paymentDate = convertDate(payment.date);
                if (!paymentDate) continue;

                const amount = parseFloat(payment.amount) || 0;
                if (amount <= 0) continue;

                // Check for existing payment
                const { data: existingPayment } = await supabase
                  .from('policy_payments')
                  .select('id')
                  .eq('policy_id', policyId)
                  .eq('payment_date', paymentDate)
                  .eq('amount', amount)
                  .maybeSingle();

                const paymentData = {
                  policy_id: policyId,
                  payment_type: mapPaymentType(payment.payment_type) as any,
                  amount: amount,
                  payment_date: paymentDate,
                  cheque_number: payment.check_number || null,
                  cheque_image_url: payment.check_image_url || null,
                  refused: payment.refused_status === 'refused',
                };

                if (existingPayment) {
                  stats.payments.updated++;
                } else {
                  const { error } = await supabase
                    .from('policy_payments')
                    .insert(paymentData);
                  if (error) {
                    stats.payments.errors.push(`Payment for policy ${policy.legacy_wp_id}: ${error.message}`);
                  } else {
                    stats.payments.inserted++;
                  }
                }
              } catch (e: any) {
                stats.payments.errors.push(`Payment: ${e.message}`);
              }
            }
          }

          // Import policy images as media files
          if (policyId && policy.images && Array.isArray(policy.images)) {
            for (const imageUrl of policy.images) {
              try {
                if (!imageUrl) continue;

                const { data: existingMedia } = await supabase
                  .from('media_files')
                  .select('id')
                  .eq('cdn_url', imageUrl)
                  .maybeSingle();

                if (!existingMedia) {
                  const fileName = imageUrl.split('/').pop() || 'file';
                  const mimeType = imageUrl.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';

                  await supabase
                    .from('media_files')
                    .insert({
                      cdn_url: imageUrl,
                      storage_path: imageUrl,
                      original_name: fileName,
                      mime_type: mimeType,
                      size: 0,
                      entity_type: 'policy',
                      entity_id: policyId,
                    });
                  stats.mediaFiles.inserted++;
                } else {
                  stats.mediaFiles.updated++;
                }
              } catch (e: any) {
                stats.mediaFiles.errors.push(`Media: ${e.message}`);
              }
            }
          }
        } catch (e: any) {
          stats.policies.errors.push(`Policy ${policy.legacy_wp_id}: ${e.message}`);
        }
      }

      // 6. Import Outside Cheques
      console.log('Importing outside cheques...');
      for (const cheque of data.outside_cheques || []) {
        try {
          const { data: existing } = await supabase
            .from('outside_cheques')
            .select('id')
            .eq('name', cheque.name)
            .eq('amount', parseFloat(cheque.amount) || 0)
            .maybeSingle();

          const chequeData = {
            name: cheque.name || 'غير معروف',
            amount: parseFloat(cheque.amount) || 0,
            cheque_number: cheque.cheque_number || null,
            cheque_date: convertDate(cheque.cheque_date),
            cheque_image_url: cheque.cheque_image_url || null,
            notes: cheque.notes || null,
            refused: cheque.refused === true,
            used: cheque.used === true,
          };

          if (existing) {
            await supabase
              .from('outside_cheques')
              .update(chequeData)
              .eq('id', existing.id);
            stats.outsideCheques.updated++;
          } else {
            const { error } = await supabase
              .from('outside_cheques')
              .insert(chequeData);
            if (error) {
              stats.outsideCheques.errors.push(`Cheque ${cheque.name}: ${error.message}`);
            } else {
              stats.outsideCheques.inserted++;
            }
          }
        } catch (e: any) {
          stats.outsideCheques.errors.push(`Cheque: ${e.message}`);
        }
      }

      console.log('Import completed!');
      console.log('Stats:', JSON.stringify(stats, null, 2));

      return new Response(JSON.stringify({ success: true, stats }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Import error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
