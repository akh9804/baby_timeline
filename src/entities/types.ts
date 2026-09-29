export type Child = {
  id: string;
  name: string | null;
  due_date: string | null;
  birth_date: string | null;
};
export type Media = {
  id: string;
  type: "image" | "video";
  width: number | null;
  height: number | null;
  file_name: string | null;
  sort_order: number;
};
export type Moment = {
  id: string;
  child_id: string;
  title: string;
  description: string | null;
  occurred_at: string;
  media: Media[];
};
export type Timeline = {
  child: Child | null;
  moments: Moment[];
  nextCursor: string | null;
};
