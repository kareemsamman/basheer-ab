-- Civil liability (مسؤولية مدنية): its own policy type, offered for cargo and bus cars,
-- standalone or as a package add-on.
-- The office collects the price from the client (office debt, like THIRD_FULL) and pays the
-- company a cost entered on each policy, stored in policies.payed_for_company;
-- profit = insurance_price - payed_for_company.

ALTER TYPE public.policy_type_parent ADD VALUE IF NOT EXISTS 'CIVIL_LIABILITY' AFTER 'ACCIDENT_FEE_EXEMPTION';
