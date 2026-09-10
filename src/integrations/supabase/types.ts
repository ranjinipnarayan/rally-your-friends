export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      deleted_rallies: {
        Row: {
          creator_token: string;
          deleted_at: string;
          invite_token: string;
        };
        Insert: {
          creator_token: string;
          deleted_at?: string;
          invite_token: string;
        };
        Update: {
          creator_token?: string;
          deleted_at?: string;
          invite_token?: string;
        };
        Relationships: [];
      };
      location_suggestions: {
        Row: {
          created_at: string;
          id: string;
          rally_id: string;
          response_id: string | null;
          text: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          rally_id: string;
          response_id?: string | null;
          text: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          rally_id?: string;
          response_id?: string | null;
          text?: string;
        };
        Relationships: [
          {
            foreignKeyName: "location_suggestions_rally_id_fkey";
            columns: ["rally_id"];
            isOneToOne: false;
            referencedRelation: "rallies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "location_suggestions_response_id_fkey";
            columns: ["response_id"];
            isOneToOne: false;
            referencedRelation: "responses";
            referencedColumns: ["id"];
          },
        ];
      };
      rallies: {
        Row: {
          activity: string;
          archived_at: string | null;
          confirmed_at: string | null;
          created_at: string;
          creator_token: string;
          expires_at: string;
          final_location: string | null;
          final_time: string | null;
          id: string;
          invite_token: string;
          location: string | null;
          location_mode: string;
          next_action: string;
          published_at: string | null;
          starts_at: string | null;
          status: string;
          time_mode: string;
          time_zone: string | null;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          activity?: string;
          archived_at?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
          creator_token: string;
          expires_at?: string;
          final_location?: string | null;
          final_time?: string | null;
          id?: string;
          invite_token: string;
          location?: string | null;
          location_mode: string;
          next_action?: string;
          published_at?: string | null;
          starts_at?: string | null;
          status?: string;
          time_mode: string;
          time_zone?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          activity?: string;
          archived_at?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
          creator_token?: string;
          expires_at?: string;
          final_location?: string | null;
          final_time?: string | null;
          id?: string;
          invite_token?: string;
          location?: string | null;
          location_mode?: string;
          next_action?: string;
          published_at?: string | null;
          starts_at?: string | null;
          status?: string;
          time_mode?: string;
          time_zone?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      rally_candidates: {
        Row: {
          created_at: string;
          id: string;
          position: number;
          rally_id: string;
          starts_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          position?: number;
          rally_id: string;
          starts_at: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          position?: number;
          rally_id?: string;
          starts_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rally_candidates_rally_id_fkey";
            columns: ["rally_id"];
            isOneToOne: false;
            referencedRelation: "rallies";
            referencedColumns: ["id"];
          },
        ];
      };
      response_candidates: {
        Row: {
          available: boolean;
          candidate_id: string;
          id: string;
          response_id: string;
        };
        Insert: {
          available?: boolean;
          candidate_id: string;
          id?: string;
          response_id: string;
        };
        Update: {
          available?: boolean;
          candidate_id?: string;
          id?: string;
          response_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "response_candidates_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: false;
            referencedRelation: "rally_candidates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "response_candidates_response_id_fkey";
            columns: ["response_id"];
            isOneToOne: false;
            referencedRelation: "responses";
            referencedColumns: ["id"];
          },
        ];
      };
      responses: {
        Row: {
          consensus: string | null;
          created_at: string;
          id: string;
          name: string;
          note: string | null;
          rally_id: string;
          updated_at: string;
        };
        Insert: {
          consensus?: string | null;
          created_at?: string;
          id?: string;
          name: string;
          note?: string | null;
          rally_id: string;
          updated_at?: string;
        };
        Update: {
          consensus?: string | null;
          created_at?: string;
          id?: string;
          name?: string;
          note?: string | null;
          rally_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "responses_rally_id_fkey";
            columns: ["rally_id"];
            isOneToOne: false;
            referencedRelation: "rallies";
            referencedColumns: ["id"];
          },
        ];
      };
      time_suggestions: {
        Row: {
          created_at: string;
          id: string;
          rally_id: string;
          response_id: string;
          starts_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          rally_id: string;
          response_id: string;
          starts_at: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          rally_id?: string;
          response_id?: string;
          starts_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "time_suggestions_rally_id_fkey";
            columns: ["rally_id"];
            isOneToOne: false;
            referencedRelation: "rallies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "time_suggestions_response_id_fkey";
            columns: ["response_id"];
            isOneToOne: false;
            referencedRelation: "responses";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      create_rally: {
        Args: {
          p_creator_token: string;
          p_invite_token: string;
          p_payload: Json;
          p_user_id: string | null;
        };
        Returns: {
          activity: string;
          archived_at: string | null;
          confirmed_at: string | null;
          created_at: string;
          creator_token: string;
          expires_at: string;
          final_location: string | null;
          final_time: string | null;
          id: string;
          invite_token: string;
          location: string | null;
          location_mode: string;
          next_action: string;
          published_at: string | null;
          starts_at: string | null;
          status: string;
          time_mode: string;
          time_zone: string | null;
          updated_at: string;
          user_id: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "rallies";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      delete_rally: {
        Args: {
          p_creator_token: string | null;
          p_rally_id: string;
          p_user_id: string | null;
        };
        Returns: boolean;
      };
      manage_rally: {
        Args: {
          p_creator_token: string | null;
          p_patch: Json;
          p_rally_id: string;
          p_user_id: string | null;
        };
        Returns: {
          activity: string;
          archived_at: string | null;
          confirmed_at: string | null;
          created_at: string;
          creator_token: string;
          expires_at: string;
          final_location: string | null;
          final_time: string | null;
          id: string;
          invite_token: string;
          location: string | null;
          location_mode: string;
          next_action: string;
          published_at: string | null;
          starts_at: string | null;
          status: string;
          time_mode: string;
          time_zone: string | null;
          updated_at: string;
          user_id: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "rallies";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      refresh_rallies: {
        Args: { p_rally_id?: string; p_user_id?: string };
        Returns: undefined;
      };
      reserve_places_request: { Args: never; Returns: boolean };
      respond_to_rally: {
        Args: { p_invite_token: string; p_payload: Json };
        Returns: string;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
