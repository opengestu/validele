-- Migration pour corriger la politique RLS permettant aux livreurs de mettre à jour le statut à 'delivered'
-- Date: 2026-01-08
-- Problème: Les livreurs ne peuvent pas mettre à jour le statut quand il passe de 'in_delivery' à 'delivered'

-- Supprimer l'ancienne politique
DROP POLICY IF EXISTS "Delivery persons can update assigned orders" ON public.orders;

-- Créer une nouvelle politique corrigée
CREATE POLICY "Delivery persons can update assigned orders" 
ON public.orders FOR UPDATE 
USING (
  -- Les vendeurs peuvent modifier leurs propres commandes
  (auth.uid() = vendor_id) OR
  -- Les livreurs peuvent s'assigner et mettre à jour leurs commandes
  (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'delivery'
    )
    AND (
      -- Peut prendre une commande disponible (non assignée)
      (delivery_person_id IS NULL AND status = 'paid')
      OR
      -- Peut mettre à jour une commande qui lui est déjà assignée (quelque soit le statut)
      (delivery_person_id = auth.uid())
    )
  )
)
WITH CHECK (
  -- Lors de la mise à jour, vérifier les mêmes conditions
  (auth.uid() = vendor_id) OR
  (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'delivery'
    )
    AND (
      -- Peut s'assigner une commande payée
      (delivery_person_id = auth.uid() AND status = 'paid')
      OR
      -- Peut mettre à jour le statut de sa commande (in_delivery -> delivered)
      (delivery_person_id = auth.uid() AND status IN ('in_delivery', 'delivered'))
    )
  )
);

-- Commentaire pour documentation
COMMENT ON POLICY "Delivery persons can update assigned orders" ON public.orders IS 
'Permet aux livreurs de prendre des commandes disponibles et de mettre à jour le statut de leurs commandes (in_delivery -> delivered)';
