export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          operationName?: string
          query?: string
          variables?: Json
          extensions?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      orders: {
        Row: {
          created_at: string | null
          id: string
          limit_price_cents: number
          quantity: number
          status: string
          stock_id: string
          trader_id: string
          type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          limit_price_cents: number
          quantity: number
          status?: string
          stock_id: string
          trader_id: string
          type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          limit_price_cents?: number
          quantity?: number
          status?: string
          stock_id?: string
          trader_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_stock_id_fkey"
            columns: ["stock_id"]
            isOneToOne: false
            referencedRelation: "stocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_trader_id_fkey"
            columns: ["trader_id"]
            isOneToOne: false
            referencedRelation: "traders"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolios: {
        Row: {
          shares_owned: number
          stock_id: string
          trader_id: string
        }
        Insert: {
          shares_owned?: number
          stock_id: string
          trader_id: string
        }
        Update: {
          shares_owned?: number
          stock_id?: string
          trader_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolios_stock_id_fkey"
            columns: ["stock_id"]
            isOneToOne: false
            referencedRelation: "stocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolios_trader_id_fkey"
            columns: ["trader_id"]
            isOneToOne: false
            referencedRelation: "traders"
            referencedColumns: ["id"]
          },
        ]
      }
      stocks: {
        Row: {
          current_price_cents: number
          id: string
          name: string
          symbol: string
          total_shares: number
        }
        Insert: {
          current_price_cents?: number
          id?: string
          name: string
          symbol: string
          total_shares?: number
        }
        Update: {
          current_price_cents?: number
          id?: string
          name?: string
          symbol?: string
          total_shares?: number
        }
        Relationships: []
      }
      strategies: {
        Row: {
          id: string
          name: string
          rules: Json
          user_id: string
        }
        Insert: {
          id?: string
          name: string
          rules: Json
          user_id: string
        }
        Update: {
          id?: string
          name?: string
          rules?: Json
          user_id?: string
        }
        Relationships: []
      }
      traders: {
        Row: {
          balance_cents: number
          id: string
          is_bot: boolean
          name: string
          strategy: string | null
          strategy_id: string
          user_id: string
        }
        Insert: {
          balance_cents?: number
          id?: string
          is_bot?: boolean
          name: string
          strategy?: string | null
          strategy_id: string
          user_id: string
        }
        Update: {
          balance_cents?: number
          id?: string
          is_bot?: boolean
          name?: string
          strategy?: string | null
          strategy_id?: string
          user_id?: string
        }
        Relationships: []
      }
      trades: {
        Row: {
          buyer_id: string
          executed_at: string | null
          execution_price_cents: number
          id: string
          quantity: number
          seller_id: string
          stock_id: string
        }
        Insert: {
          buyer_id: string
          executed_at?: string | null
          execution_price_cents: number
          id?: string
          quantity: number
          seller_id: string
          stock_id: string
        }
        Update: {
          buyer_id?: string
          executed_at?: string | null
          execution_price_cents?: number
          id?: string
          quantity?: number
          seller_id?: string
          stock_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trades_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "traders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "traders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_stock_id_fkey"
            columns: ["stock_id"]
            isOneToOne: false
            referencedRelation: "stocks"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

