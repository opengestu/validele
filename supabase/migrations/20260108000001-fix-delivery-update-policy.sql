-- Migration pour permettre aux livreurs de mettre à jour le statut des commandes qui leur sont assignées
-- Date: 2026-01-08

-- Supprimer l'ancienne politique de mise à jour
DROP POLICY IF EXISTS "Delivery persons can take orders" ON public.orders;

-- Créer une nouvelle politique pour permettre aux livreurs de prendre des commandes disponibles
-- et de mettre à jour le statut des commandes qui leur sont assignées
CREATE POLICY "Delivery persons can update assigned orders" 
ON public.orders FOR UPDATE 
USING (
  -- Les vendeurs peuvent modifier leurs propres commandes
  (auth.uid() = vendor_id) OR
  -- Les livreurs peuvent s'assigner des commandes non assignées (status = 'paid' et delivery_person_id IS NULL)
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
      -- Peut mettre à jour une commande qui lui est déjà assignée
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
      (delivery_person_id IS NULL AND status = 'paid')
      OR
      (delivery_person_id = auth.uid())
    )
  )
);

-- Commentaire pour documentation
COMMENT ON POLICY "Delivery persons can update assigned orders" ON public.orders IS 
'Permet aux livreurs de prendre des commandes disponibles et de mettre à jour le statut des commandes qui leur sont assignées';
