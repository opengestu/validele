-- Créer la table profiles pour stocker les informations des utilisateurs
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  full_name TEXT,
  phone TEXT,
  role TEXT CHECK (role IN ('buyer', 'vendor', 'delivery')) NOT NULL DEFAULT 'buyer',
  company_name TEXT,
  vehicle_info TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  PRIMARY KEY (id)
);

-- Activer RLS (Row Level Security)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Politique pour permettre aux utilisateurs de voir leur propre profil
CREATE POLICY "Users can view own profile" 
ON public.profiles FOR SELECT 
USING (auth.uid() = id);

-- Politique pour permettre aux utilisateurs de mettre à jour leur propre profil
CREATE POLICY "Users can update own profile" 
ON public.profiles FOR UPDATE 
USING (auth.uid() = id);

-- Politique pour permettre l'insertion de profils lors de l'inscription
CREATE POLICY "Users can insert own profile" 
ON public.profiles FOR INSERT 
WITH CHECK (auth.uid() = id);

-- Créer une fonction pour créer automatiquement un profil lors de l'inscription
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Try to insert a profile for the new user. Use ON CONFLICT DO NOTHING
  -- to avoid raising an error if a profile already exists or concurrent
  -- inserts happen. Also use COALESCE for role defaulting.
  INSERT INTO public.profiles (id, full_name, phone, role, company_name, vehicle_info)
  VALUES (
    new.id,
    (new.raw_user_meta_data->>'full_name'),
    (new.raw_user_meta_data->>'phone'),
    COALESCE(new.raw_user_meta_data->>'role', 'buyer'),
    (new.raw_user_meta_data->>'company_name'),
    (new.raw_user_meta_data->>'vehicle_info')
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
EXCEPTION WHEN OTHERS THEN
  -- Don't let any unexpected error in this trigger abort the auth flow.
  -- Log a notice for debugging and swallow the error so signup doesn't fail.
  RAISE NOTICE 'handle_new_user trigger error: %', SQLERRM;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Créer le trigger pour exécuter la fonction à chaque nouvel utilisateur
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Créer la table products pour les vendeur(se)s
CREATE TABLE public.products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  category TEXT,
  image_url TEXT,
  stock_quantity INTEGER DEFAULT 0,
  is_available BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  code TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(6), 'hex')
);

-- Activer RLS pour products
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Politiques pour products
CREATE POLICY "Anyone can view available products" 
ON public.products FOR SELECT 
USING (is_available = true);

CREATE POLICY "Vendors can manage their products" 
ON public.products FOR ALL 
USING (auth.uid() = vendor_id);

-- Créer la table orders pour les commandes
CREATE TABLE public.orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  buyer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  vendor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  delivery_person_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  payment_method TEXT CHECK (payment_method IN ('wave')) NOT NULL,
  delivery_address TEXT NOT NULL,
  buyer_phone TEXT NOT NULL,
  order_code TEXT,
  qr_code TEXT,
  status TEXT CHECK (status IN ('pending', 'paid', 'assigned', 'in_transit', 'delivered', 'cancelled')) DEFAULT 'pending',
  payment_confirmed_at TIMESTAMP WITH TIME ZONE,
  assigned_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Activer RLS pour orders
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Politiques pour orders
CREATE POLICY "Users can view their own orders" 
ON public.orders FOR SELECT 
USING (
  auth.uid() = buyer_id OR 
  auth.uid() = vendor_id OR 
  auth.uid() = delivery_person_id
);

CREATE POLICY "Buyers can create orders" 
ON public.orders FOR INSERT 
WITH CHECK (auth.uid() = buyer_id);

CREATE POLICY "Vendors and delivery persons can update orders" 
ON public.orders FOR UPDATE 
USING (
  auth.uid() = vendor_id OR 
  auth.uid() = delivery_person_id
);
