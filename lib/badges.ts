// Mirrors public.achievements (supabase/migrations/20261024300000_points.sql).
export const BADGES = [
  { id: "early", name: "Early Bird", description: "5 tasks before 9 am", icon: "wb_twilight" },
  { id: "fire", name: "On Fire", description: "7-day streak", icon: "local_fire_department" },
  { id: "heavy", name: "Heavy Lifter", description: "Finish a hard task", icon: "fitness_center" },
  { id: "rival", name: "Rival", description: "Win a challenge", icon: "swords" },
  { id: "sweep", name: "Clean Sweep", description: "Clear a whole day", icon: "cleaning_services" },
  { id: "slayer", name: "Giant Slayer", description: "Take #1 on the board", icon: "workspace_premium" },
  { id: "owl", name: "Night Owl", description: "10 tasks after 10 pm", icon: "dark_mode" },
  { id: "cent", name: "Centurion", description: "Finish 100 tasks", icon: "military_tech" },
] as const;

export type BadgeId = (typeof BADGES)[number]["id"];
