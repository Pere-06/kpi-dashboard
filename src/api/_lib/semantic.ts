export type ColInfo = { table_name: string; column_name: string; data_type: string };

const AMOUNT  = ["amount","importe","total_amount","total","revenue","ventas","monto","price","subtotal"];
const CUSTOMER= ["customer_id","cliente_id","client_id","user_id","customer","cliente","usuario"];
const DATECOL = ["created_at","date","fecha","order_date","timestamp","ts","datetime"];
const EXPENSE = ["expense","expenses","gastos","cost","coste","costo"];

export async function discoverColumns(q: (s:string,p?:any[])=>Promise<any[]>, schema="public"): Promise<ColInfo[]> {
  return await q<ColInfo>(
    `SELECT table_name, column_name, data_type
     FROM information_schema.columns
     WHERE table_schema = $1`,
    [schema]
  );
}

function match(name: string, list: string[]) { return list.includes(name.toLowerCase()); }

export function chooseTopCustomers(cols: ColInfo[]) {
  const by = new Map<string, ColInfo[]>(); cols.forEach(c=>by.set(c.table_name,[...(by.get(c.table_name)||[]),c]));
  for (const [table, arr] of by) {
    const amount = arr.find(c=>match(c.column_name, AMOUNT));
    const cust   = arr.find(c=>match(c.column_name, CUSTOMER));
    const date   = arr.find(c=>match(c.column_name, DATECOL));
    if (amount && cust) return { table, amount: amount.column_name, customer: cust.column_name, date: date?.column_name };
  }
  return null;
}

export function chooseSalesVsExpensesMonthly(cols: ColInfo[]) {
  const by = new Map<string, ColInfo[]>(); cols.forEach(c=>by.set(c.table_name,[...(by.get(c.table_name)||[]),c]));
  for (const [table, arr] of by) {
    const sales = arr.find(c=>match(c.column_name, AMOUNT) || ["ventas","revenue","sales"].includes(c.column_name.toLowerCase()));
    const exp   = arr.find(c=>match(c.column_name, EXPENSE));
    const date  = arr.find(c=>match(c.column_name, DATECOL));
    if (sales && exp && date) return { table, sales: sales.column_name, expenses: exp.column_name, date: date.column_name };
  }
  return null;
}
