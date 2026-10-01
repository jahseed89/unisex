/**
 * Barrel for the design-system primitives.
 *
 * Feature code imports from `@/components/ui` rather than reaching into
 * individual files, which keeps the visual language consistent and makes a
 * restyle a single-file change.
 */

export { Button, buttonVariants, type ButtonProps } from './Button'
export {
  Label,
  Field,
  Input,
  Textarea,
  Select,
  Checkbox,
  Switch,
  RadioCards,
  type FieldProps,
  type InputProps,
  type TextareaProps,
  type SelectProps,
  type CheckboxProps,
  type SwitchProps,
  type RadioOption,
  type RadioCardsProps,
} from './Field'
export { Badge, badgeVariants, statusTone, type BadgeProps } from './Badge'
export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  SectionHeading,
  Stat,
  EmptyState,
  Skeleton,
  Divider,
  VisuallyHidden,
  type SectionHeadingProps,
} from './Surface'
export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
} from './Dialog'
export { Rating, RatingInput } from './Rating'
export {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from './Accordion'
export {
  Alert,
  Table,
  THead,
  TH,
  TBody,
  TR,
  TD,
  Pagination,
  type AlertProps,
} from './Feedback'
