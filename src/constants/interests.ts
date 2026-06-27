import { Ionicons } from '@expo/vector-icons';

// Canonical interest categories — shared by onboarding (auth/customize) and the
// profile editor so the two never drift. ids are what we persist on User.interests.
export interface InterestCard {
  id: string;
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  // A distinct, muted card tint per category so the grid reads as colourful
  // rather than a wall of cream. Kept soft so the dark ink icon/label stay
  // legible on top; selection layers a lifted shadow on this base.
  color: string;
}

export const INTERESTS: InterestCard[] = [
  { id: 'hiking', name: 'Hiking', icon: 'trail-sign-outline', color: '#CDE7C8' },
  { id: 'camping', name: 'Camping', icon: 'bonfire-outline', color: '#F6D9B8' },
  { id: 'fishing', name: 'Fishing', icon: 'water-outline', color: '#BFE0EE' },
  { id: 'kayaking', name: 'Kayaking', icon: 'boat-outline', color: '#C7D8F2' },
  { id: 'birdwatching', name: 'Bird Watching', icon: 'eye-outline', color: '#E6D4F0' },
  { id: 'photography', name: 'Photography', icon: 'camera-outline', color: '#F3CBD6' },
  { id: 'cycling', name: 'Cycling', icon: 'bicycle-outline', color: '#FAE3B0' },
  { id: 'picnicking', name: 'Picnicking', icon: 'pizza-outline', color: '#F8D2C2' },
  { id: 'swimming', name: 'Swimming', icon: 'umbrella-outline', color: '#BFEBE3' },
];
