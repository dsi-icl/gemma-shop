import { Button } from './button';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

function TipButton({
    tip,
    children,
    ...props
}: { tip: string } & React.ComponentProps<typeof Button>) {
    return (
        <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon-sm" {...props} />}>
                {children}
            </TooltipTrigger>
            <TooltipContent side="top">{tip}</TooltipContent>
        </Tooltip>
    );
}

export { TipButton };
