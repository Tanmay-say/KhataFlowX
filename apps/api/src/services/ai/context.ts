import { databaseRequest } from "../database.js";

type Business = { name: string; settings: { language?: string } };
type Client = { id: string; name: string; phone: string | null; balance_paise: string };
type Item = { id: string; item_name: string; unit: string; quantity: string; price_per_unit_paise: string };
type Message = { role: "user" | "assistant"; content: string };

export async function loadChatContext(businessId: string, userId: string) {
  const businessParams = new URLSearchParams({ select: "name,settings", id: `eq.${businessId}`, limit: "1" });
  const clientParams = new URLSearchParams({ select: "id,name,phone,balance_paise", business_id: `eq.${businessId}`, archived_at: "is.null", order: "created_at.desc", limit: "30" });
  const itemParams = new URLSearchParams({ select: "id,item_name,unit,quantity,price_per_unit_paise", business_id: `eq.${businessId}`, order: "item_name.asc", limit: "50" });
  const messageParams = new URLSearchParams({ select: "role,content", business_id: `eq.${businessId}`, user_id: `eq.${userId}`, channel: "eq.web", order: "created_at.desc", limit: "6" });
  const [businesses, clients, inventory, messages] = await Promise.all([
    databaseRequest<Business[]>(`businesses?${businessParams}`),
    databaseRequest<Client[]>(`clients?${clientParams}`),
    databaseRequest<Item[]>(`inventory?${itemParams}`),
    databaseRequest<Message[]>(`chat_messages?${messageParams}`),
  ]);
  const context = {
    business: businesses[0] ? { name: businesses[0].name, language: businesses[0].settings?.language ?? "en" } : { name: "Shop", language: "en" },
    clients: clients.map(({ id, name, balance_paise }) => ({ id, name, balancePaise: balance_paise })),
    inventory: inventory.map(({ id, item_name, unit, quantity, price_per_unit_paise }) => ({ id, name: item_name, unit, quantity, pricePaise: price_per_unit_paise })),
    recentMessages: messages.reverse().map(({ role, content }) => ({ role, content: content.slice(0, 300) })),
  };
  return { context, promptContext: JSON.stringify(context).slice(0, 2000), clients, inventory };
}
