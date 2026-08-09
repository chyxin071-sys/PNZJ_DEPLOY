import {
  contractsAPI,
  invoicesAPI,
  projectsAPI,
  quotationsAPI,
  quotesAPI,
  receiptsAPI,
} from '@/db/api';
import type { Contract } from '@/types';

const toText = (value: unknown) => String(value || '').trim();
const toArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  return value ? [String(value)] : [];
};
const joinNames = (value: unknown) => toArray(value).join('、');

const docKey = (item: any) => item?._id || item?.id;

export async function syncLeadRelations(
  leadId: string,
  nextLead: any,
  previousLead?: any,
) {
  const customerNo = toText(nextLead?.customerNo || previousLead?.customerNo);
  const oldName = toText(previousLead?.name);
  const nextName = toText(nextLead?.name);
  const nextPhone = toText(nextLead?.phone);
  const nextAddress = toText(nextLead?.address);
  const updatedAt = new Date().toISOString();

  const matchesLeadId = (item: any) => {
    if (!item) return false;
    return Boolean(leadId && (
      toText(item.leadId) === leadId ||
      toText(item.relatedCustomerId) === leadId ||
      toText(item.customerId) === leadId
    ));
  };

  const projectFields: Record<string, any> = {
    updatedAt,
  };
  if (nextName) projectFields.customer = nextName;
  if (nextPhone) projectFields.phone = nextPhone;
  if (nextAddress) projectFields.address = nextAddress;
  if (nextLead.sales !== undefined) projectFields.sales = toArray(nextLead.sales);
  if (nextLead.designer !== undefined) projectFields.designer = toArray(nextLead.designer);
  if (nextLead.manager !== undefined) projectFields.manager = toArray(nextLead.manager);
  if (nextLead.area !== undefined) projectFields.area = nextLead.area;
  if (nextLead.budget !== undefined) projectFields.budget = nextLead.budget;
  if (nextLead.requirementType !== undefined) projectFields.requirementType = nextLead.requirementType;
  if (customerNo) projectFields.customerNo = customerNo;

  const contractFields: Partial<Contract> = {};
  if (nextName) contractFields.customerName = nextName;
  if (nextPhone) contractFields.customerPhone = nextPhone;
  if (nextAddress) contractFields.houseAddress = nextAddress;
  if (nextLead.sales !== undefined) contractFields.sales = joinNames(nextLead.sales);
  if (nextLead.designer !== undefined) contractFields.designer = joinNames(nextLead.designer);
  if (nextLead.manager !== undefined) contractFields.projectManager = joinNames(nextLead.manager);
  if (customerNo) contractFields.customerNo = customerNo;

  const [allProjects, allQuotes, allContracts, allReceipts, allInvoices, allQuotations] = await Promise.all([
    projectsAPI.toArray(),
    quotesAPI.toArray(),
    contractsAPI.toArray(),
    receiptsAPI.toArray(),
    invoicesAPI.toArray(),
    quotationsAPI.toArray(),
  ]);

  // Identity fields are the only safe join keys for writes. Names, phone numbers,
  // addresses, and customer numbers may be duplicated or mistyped.
  const relatedProjects = allProjects.filter((project: any) => toText(project.leadId) === leadId);
  const relatedQuotes = allQuotes.filter(matchesLeadId);
  const relatedContracts = allContracts.filter((contract: any) => toText(contract.customerId) === leadId);
  const relatedContractKeys = new Set(
    relatedContracts.flatMap((contract: any) => [contract.id, contract._id]).filter(Boolean),
  );

  const relatedReceipts = allReceipts.filter((receipt: any) =>
    relatedContractKeys.has(receipt.contractId),
  );
  const relatedInvoices = allInvoices.filter((invoice: any) => relatedContractKeys.has(invoice.contractId));
  const relatedQuotations = allQuotations.filter((quotation: any) =>
    (quotation.contractId && relatedContractKeys.has(quotation.contractId)) || matchesLeadId(quotation),
  );

  await Promise.all([
    ...relatedProjects.map((project: any) => projectsAPI.update(docKey(project), projectFields)),
    ...relatedQuotes.map((quote: any) => quotesAPI.update(docKey(quote), projectFields)),
    ...relatedContracts.map((contract: any) => contractsAPI.put({ ...contract, ...contractFields })),
    ...relatedReceipts.map((receipt: any) => receiptsAPI.put({
      ...receipt,
      customerName: nextName || receipt.customerName,
      contractNo: relatedContracts.find((contract: any) => contract.id === receipt.contractId || contract._id === receipt.contractId)?.contractNo || receipt.contractNo,
    })),
    ...relatedInvoices.map((invoice: any) => invoicesAPI.put({
      ...invoice,
      invoiceUnit: oldName && invoice.invoiceUnit === oldName ? nextName : invoice.invoiceUnit,
    })),
    ...relatedQuotations.map((quotation: any) => quotationsAPI.put({
      ...quotation,
      customerName: nextName || quotation.customerName,
      customerPhone: nextPhone || quotation.customerPhone,
      houseAddress: nextAddress || quotation.houseAddress,
    })),
  ]);

  return {
    projects: relatedProjects.length,
    quotes: relatedQuotes.length,
    contracts: relatedContracts.length,
    receipts: relatedReceipts.length,
    invoices: relatedInvoices.length,
    quotations: relatedQuotations.length,
  };
}
